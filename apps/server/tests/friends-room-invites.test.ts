import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomInviteClock, RoomInvitesService } from "../src/friends/room-invites.service";
import { FriendsGateway } from "../src/friends/friends.gateway";

class FakeClock extends RoomInviteClock {
  time=1_000_000;next=1;tasks=new Map<number,{at:number;callback:()=>void}>();
  override now(){return this.time;}
  override setTimeout(callback:()=>void,delayMs:number){const id=this.next++;this.tasks.set(id,{at:this.time+delayMs,callback});return id as unknown as ReturnType<typeof setTimeout>;}
  override clearTimeout(timer:ReturnType<typeof setTimeout>){this.tasks.delete(timer as unknown as number);}
  advance(ms:number){this.time+=ms;for(const [id,task] of [...this.tasks])if(task.at<=this.time){this.tasks.delete(id);task.callback();}}
}

function fixture(){
  const host=randomUUID(),target=randomUUID(),target2=randomUUID(),roomCode="ABC234",events:Array<{id:string;event:string}>=[],clock=new FakeClock();
  const profile=(id:string)=>({id,email:`${id}@test.invalid`,nickname:`Player ${id}`,avatar:{id:"default",name:"Default",assetPath:null}});
  let currentProfile=profile(host),occupied=false,joins=0;
  const database={db:{select:()=>({from:()=>({innerJoin:()=>({where:async()=>[currentProfile]})})})}};
  const friends={areFriends:async()=>true,onRelationshipChange:()=>()=>{}};
  const presence={isOnline:()=>true};
  const rooms={friendInviteRoom:(code:string,owner:string)=>{assert.equal(code,roomCode);assert.equal(owner,host);if(occupied)throw new Error("full");return{roomCode,themeId:"earth",timeControl:{totalMs:900000,turnMs:60000},itemsEnabled:false,hasWager:false};},friendActivity:()=>"available",acceptFriendInvite:()=>{joins++;occupied=true;return{roomCode,seat:"black",nickname:"Target",seatToken:"token",casual:true};},onRoomChange:()=>()=>{}};
  const service=new RoomInvitesService(database as never,friends as never,presence as never,rooms as never,clock);service.onEvent((id,event)=>events.push({id,event}));
  return{host,target,target2,roomCode,events,clock,service,setProfile:(id:string)=>{currentProfile=profile(id);},joins:()=>joins,setOccupied:(value:boolean)=>{occupied=value;}};
}

test("Room invite accept/decline cache lost acknowledgements and concurrent retry",async()=>{
  const f=fixture();
  try{
    const invite=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target});
    f.setProfile(f.target);const requestId="accept-lost-ack";
    const [first,retry]=await Promise.all([f.service.accept(f.target,{requestId,inviteId:invite.inviteId}),f.service.accept(f.target,{requestId,inviteId:invite.inviteId})]);
    assert.deepEqual(retry,first);assert.equal(f.joins(),1);assert.equal((first as {seat:{ready?:boolean}}).seat.ready,undefined);
    f.setOccupied(false);f.clock.advance(15_000);f.setProfile(f.host);
    const declined=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target2});
    const declineRequest="decline-lost-ack",before=f.events.length;
    const [d1,d2]=await Promise.all([f.service.decline(f.target2,{requestId:declineRequest,inviteId:declined.inviteId}),f.service.decline(f.target2,{requestId:declineRequest,inviteId:declined.inviteId})]);
    assert.deepEqual(d1,{ok:true});assert.deepEqual(d2,d1);assert.equal(f.events.slice(before).filter(x=>x.event==="friends:room-invite:declined").length,1);
  }finally{f.service.onModuleDestroy();}
});

test("Room invite requestId is scoped by account and conflicts across payload/action",async()=>{
  const f=fixture();
  try{
    const one=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target});f.clock.advance(15_000);
    const two=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target2});
    const requestId="same-resolution-id";await f.service.decline(f.target,{requestId,inviteId:one.inviteId});
    await assert.rejects(()=>f.service.decline(f.target,{requestId,inviteId:two.inviteId}),hasCode("ROOM_INVITE_REQUEST_ID_CONFLICT"));
    await assert.rejects(()=>f.service.accept(f.target,{requestId,inviteId:one.inviteId}),hasCode("ROOM_INVITE_REQUEST_ID_CONFLICT"));
    assert.deepEqual(await f.service.decline(f.target2,{requestId,inviteId:two.inviteId}),{ok:true});
  }finally{f.service.onModuleDestroy();}
});

test("Room invite expiry/invalidation precede first resolution and cache expires with fake clock",async()=>{
  const f=fixture();
  try{
    const expired=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target});f.clock.advance(60_000);
    await assert.rejects(()=>f.service.accept(f.target,{requestId:"expired",inviteId:expired.inviteId}),hasCode("room_invite_not_found"));
    const invalidated=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target2});f.service.invalidateOffline(f.target2);
    await assert.rejects(()=>f.service.decline(f.target2,{requestId:"invalidated",inviteId:invalidated.inviteId}),hasCode("room_invite_not_found"));
    f.clock.advance(15_000);const pending=await f.service.create(f.host,{requestId:randomUUID(),roomCode:f.roomCode,targetAccountId:f.target});
    await f.service.decline(f.target,{requestId:"cache-five-minutes",inviteId:pending.inviteId});f.clock.advance(299_999);
    assert.deepEqual(await f.service.decline(f.target,{requestId:"cache-five-minutes",inviteId:pending.inviteId}),{ok:true});f.clock.advance(2);
    await assert.rejects(()=>f.service.decline(f.target,{requestId:"cache-five-minutes",inviteId:pending.inviteId}),hasCode("room_invite_not_found"));
  }finally{f.service.onModuleDestroy();}
});

function hasCode(code:string){return(error:unknown)=>Boolean(error&&typeof error==="object"&&"response" in error&&(error as {response?:{code?:string}}).response?.code===code);}

test("Room invite resolution socket payload is strict and requires bounded requestId",async()=>{
  const accountId=randomUUID(),inviteId=randomUUID(),calls:unknown[]=[];
  const invites={accept:async(id:string,input:unknown)=>{calls.push({id,input});return{ok:true};},decline:async(id:string,input:unknown)=>{calls.push({id,input});return{ok:true};}};
  const gateway=new FriendsGateway({} as never,{} as never,{} as never,{} as never,invites as never),socket={data:{accountId}} as never;
  for(const payload of [{inviteId},{requestId:"",inviteId},{requestId:" ",inviteId},{requestId:"bad\nvalue",inviteId},{requestId:"x".repeat(129),inviteId},{requestId:"ok",inviteId,extra:true},null,[],"bad"]){
    assert.deepEqual(await gateway.acceptInvite(socket,payload),{ok:false,code:"invalid_room_invite"});
  }
  assert.deepEqual(await gateway.acceptInvite(socket,{requestId:"accept-1",inviteId}),{ok:true});
  assert.deepEqual(await gateway.declineInvite(socket,{requestId:"decline-1",inviteId}),{ok:true});
  assert.equal(calls.length,2);
});
