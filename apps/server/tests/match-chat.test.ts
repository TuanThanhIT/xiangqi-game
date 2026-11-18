import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMatchChatState, MATCH_EMOTE_CODES, parseMatchChatRequest, sendMatchChat } from "../src/rooms/match-chat";
import { RoomsService } from "../src/rooms/rooms.service";
import type { RoomClock } from "../src/rooms/room-clock";
import type { AuthProfile } from "../src/auth/session/session.service";

const matchId=randomUUID();
const parse=(value:unknown)=>{const parsed=parseMatchChatRequest(value);assert.ok("request" in parsed);return parsed;};

test("Chat parser strict, chuẩn hóa text và đếm Unicode code point",()=>{
 const normalized=parse({matchId:matchId.toUpperCase(),requestId:"req:1",kind:"text",text:"  chào\n\t bạn  "});
 assert.equal(normalized.request.matchId,matchId);assert.equal(normalized.request.kind,"text");
 if(normalized.request.kind==="text")assert.equal(normalized.request.text,"chào bạn");
 for(const value of [null,{matchId,requestId:"bad id",kind:"text",text:"ok"},{matchId,requestId:"x",kind:"text",text:"ok",extra:true}])
  assert.equal("code" in parseMatchChatRequest(value),true);
 assert.deepEqual(parseMatchChatRequest({matchId,requestId:"x",kind:"text",text:"😀".repeat(121)}),{code:"INVALID_CHAT_TEXT",requestId:"x"});
 assert.deepEqual(parseMatchChatRequest({matchId,requestId:"x",kind:"text",text:"a\u0000b"}),{code:"INVALID_CHAT_TEXT",requestId:"x"});
});

test("Chat chỉ nhận đúng allowlist emote",()=>{
 for(const emoteCode of MATCH_EMOTE_CODES)assert.equal("request" in parseMatchChatRequest({matchId,requestId:`e:${emoteCode}`,kind:"emote",emoteCode}),true);
 assert.deepEqual(parseMatchChatRequest({matchId,requestId:"e:bad",kind:"emote",emoteCode:"ANGRY"}),{code:"INVALID_CHAT_EMOTE",requestId:"e:bad"});
});

test("Chat sequence, buffer 20 và idempotency sống sau eviction",()=>{
 const state=createMatchChatState();let first:ReturnType<typeof sendMatchChat>|undefined;
 for(let i=0;i<21;i++){const p=parse({matchId,requestId:`r:${i}`,kind:"text",text:`m ${i}`});const ack=sendMatchChat(state,p.request,p.fingerprint,"red",`account-${i}`,i);if(i===0)first=ack;}
 assert.equal(state.messages.length,20);assert.equal(state.messages[0].sequence,2);assert.equal(state.sequence,21);
 const p=parse({matchId,requestId:"r:0",kind:"text",text:"m 0"});const retry=sendMatchChat(state,p.request,p.fingerprint,"red","account-0",50_000);
 assert.ok(first?.ok&&retry.ok);if(first?.ok&&retry.ok){assert.equal(retry.replayed,true);assert.deepEqual(retry.message,first.message);}
 assert.equal(state.messages.length,20);
});

test("Chat requestId conflict không phát hay tính quota",()=>{
 const state=createMatchChatState(),a=parse({matchId,requestId:"same",kind:"text",text:"a"}),b=parse({matchId,requestId:"same",kind:"text",text:"b"});
 assert.equal(sendMatchChat(state,a.request,a.fingerprint,"red","red",0).ok,true);
 assert.deepEqual(sendMatchChat(state,b.request,b.fingerprint,"red","red",100),{ok:false,requestId:"same",code:"CHAT_REQUEST_ID_CONFLICT"});
 assert.equal(state.sequence,1);assert.deepEqual(state.successes.get("red"),[0]);
});

test("Chat cooldown 1 giây trả retryAfterMs chính xác",()=>{
 const state=createMatchChatState(),a=parse({matchId,requestId:"a",kind:"text",text:"a"}),b=parse({matchId,requestId:"b",kind:"text",text:"b"});
 sendMatchChat(state,a.request,a.fingerprint,"red","red",10_000);
 assert.deepEqual(sendMatchChat(state,b.request,b.fingerprint,"red","red",10_250),{ok:false,requestId:"b",code:"CHAT_RATE_LIMITED",retryAfterMs:750});
 assert.equal(sendMatchChat(state,b.request,b.fingerprint,"red","red",11_000).ok,true);
});

test("Chat rolling window 20/phút và biên 60 giây",()=>{
 const state=createMatchChatState();for(let i=0;i<20;i++){const p=parse({matchId,requestId:`w${i}`,kind:"text",text:"x"});assert.equal(sendMatchChat(state,p.request,p.fingerprint,"red","red",i*1_000).ok,true);}
 const blocked=parse({matchId,requestId:"blocked",kind:"text",text:"x"});
 assert.deepEqual(sendMatchChat(state,blocked.request,blocked.fingerprint,"red","red",20_000),{ok:false,requestId:"blocked",code:"CHAT_RATE_LIMITED",retryAfterMs:40_000});
 assert.equal(sendMatchChat(state,blocked.request,blocked.fingerprint,"red","red",60_000).ok,true);
});

test("Chat quota độc lập theo account",()=>{
 const state=createMatchChatState(),a=parse({matchId,requestId:"one",kind:"text",text:"x"}),b=parse({matchId,requestId:"two",kind:"text",text:"x"});
 assert.equal(sendMatchChat(state,a.request,a.fingerprint,"red","red",0).ok,true);
 assert.equal(sendMatchChat(state,b.request,b.fingerprint,"black","black",0).ok,true);
});

test("Chat đóng từ chối message mới nhưng vẫn replay message cũ",()=>{
 const state=createMatchChatState(),p=parse({matchId,requestId:"done",kind:"emote",emoteCode:"GG"});const first=sendMatchChat(state,p.request,p.fingerprint,"red","red",0);
 state.open=false;state.closedAt=1;state.closeReason="resignation";
 const retry=sendMatchChat(state,p.request,p.fingerprint,"red","red",2);assert.ok(first.ok&&retry.ok&&retry.replayed);
 const next=parse({matchId,requestId:"late",kind:"text",text:"late"});assert.deepEqual(sendMatchChat(state,next.request,next.fingerprint,"red","red",2),{ok:false,requestId:"late",code:"CHAT_NOT_AVAILABLE"});
});

test("RoomsService mở chat khi bắt đầu, snapshot riêng, đóng đúng một lần cùng terminal",async()=>{
 let now=1_000;const tasks=new Set<{at:number;run:()=>void}>();
 const clock:RoomClock={now:()=>now,schedule(run,delay){const task={at:now+delay,run};tasks.add(task);return()=>tasks.delete(task);}};
 const service=new RoomsService(()=>"ABC234",clock),profile=(id:string):AuthProfile=>({id,email:`${id}@test.local`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}});
 try{
  service.createCasual(profile("red"),"earth");service.joinCasual("ABC234",profile("black"));
  const red={roomCode:"ABC234",seat:"red"} as const,black={roomCode:"ABC234",seat:"black"} as const;
  service.claimSocket(red,"red-socket");service.markSocketAttached(red,"red-socket");service.claimSocket(black,"black-socket");service.markSocketAttached(black,"black-socket");
  await service.setReady("ABC234","red",true);await service.setReady("ABC234","black",true);
  const match=service.matchSnapshot(red,"red-socket")!,events:unknown[]=[];service.onChatEvent(event=>events.push(event));
  const request={matchId:match.matchId,requestId:"chat-1",kind:"text",text:"  xin\nchào "};
  const sent=service.chatSend(red,"red-socket",request);assert.ok(sent.ok&&!sent.replayed);assert.equal(events.length,1);
  assert.deepEqual(service.chatSend(red,"red-socket",request),sent.ok?{...sent,replayed:true}:sent);assert.equal(events.length,1);
  const snapshot=service.chatSnapshot(black,"black-socket",{matchId:match.matchId}) as {ok:boolean;snapshot:{open:boolean;messages:unknown[]}};
  assert.equal(snapshot.ok,true);assert.equal(snapshot.snapshot.open,true);assert.equal(snapshot.snapshot.messages.length,1);
  const resign=service.matchAction(red,"red-socket","resign",{matchId:match.matchId,requestId:randomUUID(),expectedVersion:match.stateVersion});assert.equal(resign.ok,true);
  assert.equal(events.length,2);assert.equal((events[1] as {name:string}).name,"match:chat:closed");
  service.notifyChange("ABC234");assert.equal(events.length,2);
  assert.deepEqual(service.chatSend(black,"black-socket",{matchId:match.matchId,requestId:"late",kind:"emote",emoteCode:"GG"}),{ok:false,requestId:"late",code:"CHAT_NOT_AVAILABLE"});
  assert.equal((service.chatSnapshot(black,"black-socket",{matchId:match.matchId}) as {snapshot:{open:boolean}}).snapshot.open,false);
  assert.deepEqual(service.chatSnapshot(black,"black-socket",{matchId:match.matchId,extra:true}),{ok:false,code:"INVALID_CHAT_REQUEST"});
  assert.deepEqual(service.chatSend({roomCode:"ABC234",seat:"red"},"old",request),{ok:false,requestId:"chat-1",code:"CHAT_FORBIDDEN"});
  now=2_000;
 }finally{await service.onModuleDestroy();}
});
