import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { UnauthorizedException } from "@nestjs/common";
import { io, Socket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { configureHttp } from "../src/configure-http";
import type { JsonParserApplication } from "../src/configure-http";
import { SessionService } from "../src/auth/session/session.service";
import type { SeatResponse } from "../src/rooms/rooms.types";
import { RoomsService } from "../src/rooms/rooms.service";

test("Casual HTTP/socket: authentication, identity binding, outsider/invalid input and concurrent ready",{timeout:30000},async()=>{
 const app=await NestFactory.create<JsonParserApplication>(AppModule,{logger:false,abortOnError:false,bodyParser:false});
 const clients:Socket[]=[];
 try{
  // Isolate room authorization from JWT cryptography/DB; real login is covered by Playwright.
  app.get(SessionService).authenticate=async authorization=>{
   const id=authorization?.replace(/^Bearer /,"");
   if(!id||!["red","black","outsider"].includes(id))throw new UnauthorizedException({code:"UNAUTHENTICATED"});
   return {id,email:`${id}@example.test`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}};
  };
  configureHttp(app);await app.listen(0,"127.0.0.1");const base=await app.getUrl();
  const request=(path:string,id:string,body:object)=>fetch(base+path,{method:"POST",headers:{Origin:"http://localhost:3000",Authorization:`Bearer ${id}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await request("/casual-rooms","",{themeId:"earth"})).status,401);
  assert.equal((await request("/casual-rooms","red",{themeId:"earth",nickname:"spoof"})).status,400);
  const created=await request("/casual-rooms","red",{themeId:"snow"});assert.equal(created.status,201);assert.ok(created.headers.get("x-request-id"));
  const red=await created.json() as SeatResponse;
  const joined=await request(`/casual-rooms/${red.roomCode}/join`,"black",{});assert.equal(joined.status,200);const black=await joined.json() as SeatResponse;
  assert.equal((await request(`/casual-rooms/${red.roomCode}/join`,"outsider",{})).status,409);
  assert.equal((await request(`/casual-rooms/${red.roomCode}/ready`,"outsider",{ready:true})).status,403);
  assert.equal((await request(`/casual-rooms/${red.roomCode}/leave`,"outsider",{})).status,403);
  assert.equal((await request(`/casual-rooms/${red.roomCode}/ready`,"red",{ready:"true"})).status,400);
  assert.equal((await request("/casual-rooms/ABC/join","outsider",{})).status,400);
  async function connect(seat:SeatResponse,id:string,valid:boolean){
   const socket=io(base+"/rooms",{autoConnect:false,forceNew:true,reconnection:false,transports:["websocket"],extraHeaders:{Origin:"http://localhost:3000"},auth:{roomCode:seat.roomCode,seatToken:seat.seatToken,accessToken:id}});clients.push(socket);
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Room handshake timed out")),4000);socket.once(valid?"room:session":"connect_error",()=>{clearTimeout(timer);resolve();});socket.connect();});
   return socket;
  }
  await connect(red,"outsider",false);await connect(red,"red",true);await connect(black,"black",true);
  const responses=await Promise.all([request(`/casual-rooms/${red.roomCode}/ready`,"red",{ready:true}),request(`/casual-rooms/${red.roomCode}/ready`,"black",{ready:true})]);
  assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(app.get(RoomsService).publicGameState(red.roomCode).game?.revision,0);
  assert.equal((await request(`/casual-rooms/${red.roomCode}/ready`,"red",{ready:false})).status,409);
 }finally{for(const socket of clients)socket.disconnect();await app.close();}
});
