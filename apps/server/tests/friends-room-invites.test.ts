import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomInvitesService } from "../src/friends/room-invites.service";

test("Friend room invite: owner boundary, idempotency, cooldown, decline and accept",async()=>{
  const host=randomUUID(),target=randomUUID(),target2=randomUUID(),roomCode="ABC234",events:Array<{id:string;event:string}>=[];
  const profile=(id:string)=>({id,email:`${id}@test.invalid`,nickname:`Player ${id}`,avatar:{id:"default",name:"Default",assetPath:null}});
  let currentProfile=profile(host),occupied=false;
  const database={db:{select:()=>({from:()=>({innerJoin:()=>({where:async()=>[currentProfile]})})})}};
  const friends={areFriends:async()=>true,onRelationshipChange:()=>()=>{}};
  const presence={isOnline:()=>true};
  const rooms={friendInviteRoom:(code:string,owner:string)=>{assert.equal(code,roomCode);assert.equal(owner,host);if(occupied)throw new Error("full");return{roomCode,themeId:"earth",timeControl:{totalMs:900000,turnMs:60000},itemsEnabled:false,hasWager:false};},friendActivity:()=>"available",acceptFriendInvite:()=>{occupied=true;return{roomCode,seat:"black",nickname:"Target",seatToken:"token",casual:true};},onRoomChange:()=>()=>{}};
  const service=new RoomInvitesService(database as never,friends as never,presence as never,rooms as never);service.onEvent((id,event)=>events.push({id,event}));
  try{
    const requestId=randomUUID(),first=await service.create(host,{requestId,roomCode,targetAccountId:target}),retry=await service.create(host,{requestId,roomCode,targetAccountId:target});assert.equal(retry.inviteId,first.inviteId);assert.ok(events.some(x=>x.id===target&&x.event==="friends:room-invite:received"));
    await assert.rejects(()=>service.create(host,{requestId:randomUUID(),roomCode,targetAccountId:target}),e=>(e as {response?:{code?:string}}).response?.code==="room_invite_cooldown");assert.deepEqual(service.decline(target,first.inviteId),{ok:true});assert.deepEqual(service.decline(target,first.inviteId),{ok:true});
    currentProfile=profile(host);const second=await service.create(host,{requestId:randomUUID(),roomCode,targetAccountId:target2});currentProfile=profile(target2);const accepted=await service.accept(target2,second.inviteId);assert.equal(accepted.seat.seat,"black");assert.equal(occupied,true);
  }finally{service.onModuleDestroy();}
});
