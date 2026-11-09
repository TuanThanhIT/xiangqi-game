import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { RoomsService } from "../src/rooms/rooms.service";
import type { AuthProfile } from "../src/auth/session/session.service";
import type { RoomClock } from "../src/rooms/room-clock";
const profile=(id:string):AuthProfile=>({id,email:`${id}@example.test`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}});
function setup(){
 let now=0,index=0;const tasks=new Set<{at:number;fn:()=>void}>();
 const clock:RoomClock={now:()=>now,schedule(fn,delay){const task={at:now+delay,fn};tasks.add(task);return()=>{tasks.delete(task);};}};
 const service=new RoomsService(()=>["ABC234","DEF234","GHJ234"][index++],clock);
 const red=service.createCasual(profile("red"),"bamboo"), black=service.joinCasual(red.roomCode,profile("black"));
 const connect=(seat:"red"|"black",socket=seat)=>{const identity={roomCode:red.roomCode,seat};service.claimSocket(identity,socket);return service.markSocketAttached(identity,socket);};
 connect("red");connect("black");
 return {service,red,black,connect,tasks,set:(n:number)=>{now=n;},flush:()=>{for(const task of [...tasks])if(task.at<=now){tasks.delete(task);task.fn();}}};
}
test("Casual ready: explicit toggle, concurrent requests start exactly once and outsiders cannot act",async()=>{
 const s=setup();try{
  assert.equal(s.service.publicGameState(s.red.roomCode).game,null);
  assert.throws(()=>s.service.setReady(s.red.roomCode,"outsider",true));
  assert.throws(()=>s.service.leaveCasual(s.red.roomCode,"outsider"));
  assert.throws(()=>s.service.createCasual(profile("red"),"earth"));
  assert.throws(()=>s.service.joinCasual(s.red.roomCode,profile("third")));
  s.service.setReady(s.red.roomCode,"red",true);assert.equal(s.service.publicGameState(s.red.roomCode).game,null);
  s.service.setReady(s.red.roomCode,"red",false);assert.equal(s.service.publicState(s.red.roomCode).players.red.ready,false);
  await Promise.all([Promise.resolve().then(()=>s.service.setReady(s.red.roomCode,"red",true)),Promise.resolve().then(()=>s.service.setReady(s.red.roomCode,"black",true))]);
  const game=s.service.publicGameState(s.red.roomCode).game;assert.equal(game?.revision,0);assert.equal(game?.sideToMove,"red");
  assert.throws(()=>s.service.setReady(s.red.roomCode,"black",false));assert.throws(()=>s.service.leaveCasual(s.red.roomCode,"red"));
  assert.deepEqual(s.service.publicGameState(s.red.roomCode).game,game);assert.equal(s.tasks.size,0);
 }finally{s.service.onModuleDestroy();}
});
test("Casual leave: guest clears both ready flags and revokes old token; host closes room",()=>{
 const s=setup();try{
  s.service.setReady(s.red.roomCode,"red",true);s.service.leaveCasual(s.red.roomCode,"black");
  const state=s.service.publicState(s.red.roomCode);assert.equal(state.players.black,null);assert.equal(state.players.red.ready,false);
  assert.equal(s.service.authenticate(s.black.roomCode,s.black.seatToken),null);
  const next=s.service.joinCasual(s.red.roomCode,profile("third"));assert.equal(next.seat,"black");
  assert.throws(()=>s.service.join(s.red.roomCode,"anonymous"));
  s.service.leaveCasual(s.red.roomCode,"red");assert.equal(s.service.authenticate(s.red.roomCode,s.red.seatToken),null);assert.equal(s.service.authenticate(next.roomCode,next.seatToken),null);
 }finally{s.service.onModuleDestroy();}
});
test("Casual reconnect: holds seat 60 seconds, requires ready again, stale disconnect cannot clear active socket",()=>{
 const s=setup();try{
  s.service.setReady(s.red.roomCode,"red",true);s.service.releaseSocket({roomCode:s.red.roomCode,seat:"red"},"red");
  s.set(59999);assert.ok(s.service.authenticate(s.red.roomCode,s.red.seatToken));s.connect("red","new" as "red");
  assert.equal(s.service.publicState(s.red.roomCode).players.red.ready,false);
  assert.equal(s.service.releaseSocket({roomCode:s.red.roomCode,seat:"red"},"red"),false);
  s.set(60001);s.flush();assert.ok(s.service.authenticate(s.red.roomCode,s.red.seatToken));
 }finally{s.service.onModuleDestroy();}
});
test("Casual timeout: guest frees seat; exact host expiry closes room even before timer runs",()=>{
 for(const side of ["red","black"] as const){const s=setup();try{
  s.service.releaseSocket({roomCode:s.red.roomCode,seat:side},side);s.set(60000);
  const token=side==="red"?s.red:s.black;assert.equal(s.service.authenticate(token.roomCode,token.seatToken),null);
  if(side==="black"){assert.equal(s.service.publicState(s.red.roomCode).players.black,null);assert.equal(s.service.joinCasual(s.red.roomCode,profile("third")).seat,"black");}
  else assert.throws(()=>s.service.publicState(s.red.roomCode));
 }finally{s.service.onModuleDestroy();}}
});
