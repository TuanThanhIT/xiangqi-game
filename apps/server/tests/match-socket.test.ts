import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { UnauthorizedException } from "@nestjs/common";
import { io, Socket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { configureHttp } from "../src/configure-http";
import type { JsonParserApplication } from "../src/configure-http";
import { SessionService } from "../src/auth/session/session.service";
import { RoomsService } from "../src/rooms/rooms.service";
import { LoadoutService } from "../src/items/loadout.service";
import { ItemUsageService } from "../src/items/item-usage.service";
import type { RoomClock } from "../src/rooms/room-clock";
import type { Room, SeatResponse } from "../src/rooms/rooms.types";
import type { MatchAck, MatchSnapshot } from "../src/rooms/match-engine";
import { MissionService } from "../src/missions/mission.service";
import { MatchHistoryService } from "../src/match-history/match-history.service";

function event<T>(socket:Socket,name:string,predicate:(v:T)=>boolean=()=>true):Promise<T>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.off(name,listener);reject(new Error(`Missing ${name}`));},4000);
  function listener(value:T){if(predicate(value)){clearTimeout(timer);socket.off(name,listener);resolve(value);}}
  socket.on(name,listener);
 });
}
const emit=<T>(socket:Socket,name:string,payload:unknown={}):Promise<T>=>new Promise((resolve,reject)=>{
 socket.timeout(4000).emit(name,payload,(error:Error|null,value:T)=>error?reject(error):resolve(value));
});

test("Match Socket.IO: snapshot riêng, move ack/conflict, draw events, expiry, reconnect và agreement",{timeout:30000},async()=>{
 const app=await NestFactory.create<JsonParserApplication>(AppModule,{logger:false,abortOnError:false,bodyParser:false});
 const clients:Socket[]=[];let now=1000;const timers=new Set<{at:number;callback:()=>void}>();
 try{
  const service=app.get(RoomsService);
  const clock:RoomClock={now:()=>now,schedule(callback,delay){const t={at:now+delay,callback};timers.add(t);return()=>{timers.delete(t);};}};
  (service as unknown as {clock:RoomClock}).clock=clock;
  app.get(SessionService).authenticate=async authorization=>{
   const id=authorization?.replace(/^Bearer /,"");if(!id||!["red","black"].includes(id))throw new UnauthorizedException();
   return {id,email:`${id}@example.test`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}};
  };
  let snapshots=0,consumes=0;app.get(LoadoutService).snapshot=async()=>{snapshots++;};
  app.get(ItemUsageService).consume=async input=>{consumes++;return {fingerprint:input.fingerprint} as never;};
  app.get(ItemUsageService).reconcile=async()=>undefined;
  app.get(MissionService).record=async()=>{};app.get(MissionService).apply=async()=>{};
  const history=app.get(MatchHistoryService);history.start=async()=>{};history.finalize=async()=>{};history.markActivity=async()=>{};history.updateStatuses=async()=>{};
  configureHttp(app);await app.listen(0,"127.0.0.1");const base=await app.getUrl();
  const post=(path:string,id:string,body:object)=>fetch(base+path,{method:"POST",headers:{Origin:"http://localhost:3000",Authorization:`Bearer ${id}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const red=await (await post("/casual-rooms","red",{themeId:"earth"})).json() as SeatResponse;
  const black=await (await post(`/casual-rooms/${red.roomCode}/join`,"black",{})).json() as SeatResponse;
  async function connect(seat:SeatResponse,id:string){
   const socket=io(base+"/rooms",{autoConnect:false,forceNew:true,reconnection:false,transports:["websocket"],extraHeaders:{Origin:"http://localhost:3000"},auth:{roomCode:seat.roomCode,seatToken:seat.seatToken,accessToken:id}});
   clients.push(socket);const attached=event(socket,"room:session");socket.connect();await attached;return socket;
  }
  let sr=await connect(red,"red");const sb=await connect(black,"black");
  const room=(service as unknown as {rooms:Map<string,Room>}).rooms.get(red.roomCode)!;
  room.itemsEnabled=true;room.red.loadout=["scout"];room.black!.loadout=["seal"];
  await post(`/casual-rooms/${red.roomCode}/ready`,"red",{ready:true});
  const initial=event<MatchSnapshot>(sr,"match:state");await post(`/casual-rooms/${red.roomCode}/ready`,"black",{ready:true});
  const start=await initial;assert.deepEqual(start.ownLoadout,["scout"]);
  const snapshot=async(socket:Socket)=>(await emit<{ok:true;snapshot:MatchSnapshot}>(socket,"match:snapshot")).snapshot;
  assert.deepEqual((await snapshot(sb)).ownLoadout,["seal"]);assert.equal(JSON.stringify(start).includes("seal"),false);
  const request=async(extra:object={})=>({matchId:start.matchId,requestId:randomUUID(),expectedVersion:(await snapshot(sr)).stateVersion,...extra});
  const item=await request({itemCode:"scout",targetPieceId:"black-soldier-0"});
  const privateState=event<MatchSnapshot>(sr,"match:state",s=>s.ownScout?.targetPieceId==="black-soldier-0");
  const publicState=event<MatchSnapshot>(sb,"match:state",s=>s.usedItems.some(i=>i.itemCode==="scout"));
  const itemAck=await emit<MatchAck>(sr,"match:item:use",item);assert.equal(itemAck.ok,true);assert.ok(itemAck.ok&&itemAck.scout);
  assert.deepEqual(await emit(sr,"match:item:use",item),itemAck);assert.equal(consumes,1);
  const ownAfterItem=await privateState,opponentAfterItem=await publicState;
  assert.equal(ownAfterItem.ownScout?.stale,false);assert.equal(opponentAfterItem.ownScout,null);
  assert.equal(JSON.stringify(opponentAfterItem).includes("black-soldier-0"),true); // board is public
  assert.equal(opponentAfterItem.usedItems.find(i=>i.itemCode==="scout")?.targetPieceId,undefined);
  const req=await request({from:{row:6,col:0},to:{row:5,col:0}});
  const updated=event<MatchSnapshot>(sb,"match:state",s=>s.moveNumber===1);
  const ack=await emit<MatchAck>(sr,"match:move",req);assert.equal(ack.ok,true);assert.equal((await updated).sideToMove,"black");
  assert.deepEqual(await emit(sr,"match:move",req),ack);
  const conflict=await emit<MatchAck>(sr,"match:move",{...req,to:{row:4,col:0}});assert.ok(!conflict.ok&&conflict.code==="request_id_conflict");
  assert.equal((await emit<MatchAck>(sb,"match:move",await request({from:{row:3,col:0},to:{row:4,col:0}}))).ok,true);
  assert.equal((await emit<MatchAck>(sr,"match:move",await request({from:{row:5,col:0},to:{row:4,col:0}}))).ok,true);
  assert.equal((await snapshot(sr)).captured.length,1);
  const offer=await request();const offerEvent=event<{offer:{status:string}}>(sb,"match:draw:state");
  assert.equal((await emit<MatchAck>(sr,"match:draw:offer",offer)).ok,true);assert.equal((await offerEvent).offer.status,"pending");
  const replaced=event(sr,"room:replaced");const old=sr;sr=await connect(red,"red");await replaced;assert.equal(old.connected,false);
  assert.equal((await snapshot(sr)).drawOffer!.id,offer.requestId);assert.equal((await snapshot(sr)).matchId,start.matchId);assert.equal(snapshots,1);
  assert.equal((await emit<MatchAck>(sb,"match:draw:reject",await request({offerId:offer.requestId}))).ok,true);
  const second=await request();assert.equal((await emit<MatchAck>(sb,"match:draw:offer",second)).ok,true);
  const expired=event<{offer:{status:string}}>(sr,"match:draw:state",s=>s.offer.status==="expired");
  now=16000;for(const t of [...timers])if(t.at<=now){timers.delete(t);t.callback();}await expired;
  assert.equal((await snapshot(sr)).clock.turnDeadlineAt,61000);
  // Sau expiry, dùng trận đang sống để kiểm tra handler đầu hàng mới và kết thúc hai socket.
  const ended=[event<MatchSnapshot>(sr,"match:ended"),event<MatchSnapshot>(sb,"match:ended")];
  const resign=await request();assert.equal((await emit<MatchAck>(sr,"match:resign",resign)).ok,true);
  for(const state of await Promise.all(ended)){assert.equal(state.reason,"resignation");assert.equal(state.status,"finished");assert.equal(state.clock.runningSide,null);}
  assert.equal((await emit<MatchAck>(sr,"match:resign",resign)).ok,true);
  assert.deepEqual((await snapshot(sb)).ownLoadout,["seal"]);
 }finally{for(const socket of clients)socket.disconnect();await app.close();}
});
