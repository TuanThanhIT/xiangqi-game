import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomsService } from "../src/rooms/rooms.service";
import type { Room } from "../src/rooms/rooms.types";
import type { RoomClock } from "../src/rooms/room-clock";
import type { LoadoutService } from "../src/items/loadout.service";
import type { ItemUsageService, UsageInput } from "../src/items/item-usage.service";
import type { AuthProfile } from "../src/auth/session/session.service";
import type { MatchAck } from "../src/rooms/match-engine";

const profile=(id:string):AuthProfile=>({id,email:`${id}@example.test`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}});
async function setup(loadout=["scout","time_pressure","calm"],consume?: (input:UsageInput)=>Promise<unknown>) {
 let now=1000;const clock:RoomClock={now:()=>now,schedule:()=>()=>{}};
 const loadouts={snapshot:async()=>{}} as unknown as LoadoutService;
 const usage={consume:consume??(async input=>({fingerprint:input.fingerprint})),reconcile:async()=>undefined} as unknown as ItemUsageService;
 const service=new RoomsService(()=>"ITEM23",clock,undefined,undefined,loadouts,usage);
 const red=service.createCasual(profile("red"),"earth"),black=service.joinCasual(red.roomCode,profile("black"));
 const identity=(seat:"red"|"black")=>({roomCode:red.roomCode,seat});
 for(const side of ["red","black"] as const){service.claimSocket(identity(side),side);service.markSocketAttached(identity(side),side);}
 const room=(service as unknown as {rooms:Map<string,Room>}).rooms.get(red.roomCode)!;room.itemsEnabled=true;room.red.loadout=loadout;room.black!.loadout=["seal"];
 await service.setReady(red.roomCode,"red",true);await service.setReady(red.roomCode,"black",true);
 const snapshot=()=>service.matchSnapshot(identity("red"),"red")!;
 const request=(itemCode:string,targetPieceId?:string)=>({matchId:snapshot().matchId,requestId:randomUUID(),expectedVersion:snapshot().stateVersion,itemCode,...(targetPieceId?{targetPieceId}:{})});
 return {service,room,identity,snapshot,request,setNow:(v:number)=>{now=v;}};
}
async function failure(promise:Promise<MatchAck>):Promise<string>{const ack=await promise;assert.equal(ack.ok,false);return ack.ok?"":ack.code;}

test("item action validates room, turn, snapshot, version and one item per turn",async()=>{
 const s=await setup();try{
  const disabled=s.request("scout","black-soldier-0");s.room.itemsEnabled=false;
  assert.equal(await failure(s.service.useItem(s.identity("red"),"red",disabled)),"items_disabled");s.room.itemsEnabled=true;
  const stale={...s.request("scout","black-soldier-0"),expectedVersion:99};assert.equal(await failure(s.service.useItem(s.identity("red"),"red",stale)),"stale_version");
  assert.equal(await failure(s.service.useItem(s.identity("black"),"black",{...s.request("seal","red-soldier-0")})),"not_your_turn");
  assert.equal(await failure(s.service.useItem(s.identity("red"),"red",s.request("shield","red-soldier-0"))),"item_not_equipped");
  assert.equal((await s.service.useItem(s.identity("red"),"red",s.request("scout","black-soldier-0"))).ok,true);
  assert.equal(await failure(s.service.useItem(s.identity("red"),"red",s.request("time_pressure"))),"item_already_used_this_turn");
 }finally{await s.service.onModuleDestroy();}
});

test("concurrent retry shares transaction and blocks move/resign/draw until commit",async()=>{
 let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 const s=await setup(undefined,async input=>{calls++;await gate;return {fingerprint:input.fingerprint};});try{
  const req=s.request("scout","black-soldier-0");const first=s.service.useItem(s.identity("red"),"red",req);
  const retry=s.service.useItem(s.identity("red"),"red",req);
  const move=s.service.matchAction(s.identity("red"),"red","move",{matchId:req.matchId,requestId:randomUUID(),expectedVersion:0,from:{row:6,col:0},to:{row:5,col:0}});
  assert.equal(move.ok?"":move.code,"action_pending");
  const resign=s.service.resign(s.identity("red"),"red",{requestId:randomUUID()});assert.equal(resign.ok?"":resign.code,"ACTION_PENDING");
  release();assert.deepEqual(await first,await retry);assert.equal(calls,1);assert.equal(s.snapshot().stateVersion,1);
  assert.equal((await s.service.useItem(s.identity("red"),"red",req)).ok,true);assert.equal(calls,1);
 }finally{await s.service.onModuleDestroy();}
});

test("clock keeps elapsed time during DB wait and a reached deadline wins after committed item",async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const s=await setup(["scout"],async input=>{await gate;return {fingerprint:input.fingerprint};});try{
  const action=s.service.useItem(s.identity("red"),"red",s.request("scout","black-soldier-0"));
  s.setNow(61000);release();const ack=await action;assert.equal(ack.ok,true);
  assert.equal(s.snapshot().reason,"turn_timeout");assert.equal(s.snapshot().clock.remainingMs.red,840000);
 }finally{await s.service.onModuleDestroy();}
});
