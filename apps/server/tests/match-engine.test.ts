import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getGameStatus } from "@xiangqi/rules";
import type { Piece, Side } from "@xiangqi/rules";
import { RoomsService } from "../src/rooms/rooms.service";
import type { Room } from "../src/rooms/rooms.types";
import type { RoomClock } from "../src/rooms/room-clock";
import type { MatchAck, MatchAction } from "../src/rooms/match-engine";
import type { AuthProfile } from "../src/auth/session/session.service";
import type { BettingService } from "../src/wallet/betting.service";
import type { LoadoutService } from "../src/items/loadout.service";
import * as gameHelpers from "../src/rooms/room-game";

const profile=(id:string):AuthProfile=>({id,email:`${id}@example.test`,nickname:id,avatar:{id:"default",name:"Default",assetPath:null}});
async function setup(stake=0,items=false) {
  let now=1000, holds=0, snapshots=0, payouts=0, records=0, failRecord=false, failPayout=false;
  const tasks=new Set<{at:number;run:()=>void}>();
  const clock:RoomClock={now:()=>now,schedule(run,delay){const task={at:now+delay,run};tasks.add(task);return()=>{tasks.delete(task);};}};
  let durable:unknown=null;
  const betting={async hold(){holds++;return {status:"held"};},async recordResult(_id:string,result:unknown){records++;if(failRecord)throw new Error("db unavailable");durable=structuredClone(result);},
    async settle(){if(failPayout)throw new Error("db unavailable");payouts++;return {status:(durable as {status:string}).status==="draw"?"refunded":"settled"};}} as unknown as BettingService;
  const loadouts={async snapshot(){snapshots++;}} as unknown as LoadoutService;
  const service=new RoomsService(()=>"ABC234",clock,betting,undefined,loadouts);
  service.createCasual(profile("red"),"earth");service.joinCasual("ABC234",profile("black"));
  const identity=(seat:Side)=>({roomCode:"ABC234",seat});
  const sockets:Record<Side,string>={red:"red",black:"black"};
  const connect=(side:Side,id=side as string)=>{sockets[side]=id;service.claimSocket(identity(side),id);service.markSocketAttached(identity(side),id);};
  connect("red");connect("black");
  const room=(service as unknown as {rooms:Map<string,Room>}).rooms.get("ABC234")!;
  room.stake=stake;room.itemsEnabled=items;room.red.loadout=["scout"];room.black!.loadout=["seal"];
  await service.setReady("ABC234","red",true);await service.setReady("ABC234","black",true);
  const state=(side:Side="red")=>service.matchSnapshot(identity(side),sockets[side])!;
  const request=(extra:object={})=>({matchId:state().matchId,requestId:randomUUID(),expectedVersion:state().stateVersion,...extra});
  const action=(side:Side,kind:MatchAction,payload:unknown=request())=>service.matchAction(identity(side),sockets[side],kind,payload);
  const move=(side:Side,from:object,to:object)=>action(side,"move",request({from,to}));
  return {service,room,state,request,action,move,identity,connect,sockets,tasks,
    set:(value:number)=>{now=value;},flush(){for(const t of [...tasks])if(t.at<=now){tasks.delete(t);t.run();}},
    stats:()=>({holds,snapshots,payouts,records,durable}),fail:(record:boolean,payout=false)=>{failRecord=record;failPayout=payout;}};
}
function error(ack:MatchAck,code:string){assert.equal(ack.ok,false);if(!ack.ok)assert.equal(ack.code,code);}
const piece=(id:string,side:Side,type:Piece["type"],row:number,col:number):Piece=>({id,side,type,position:{row:row as Piece["position"]["row"],col:col as Piece["position"]["col"]}});

test("Match: UUID không cược, Đỏ trước, snapshot riêng, reconnect giữ snapshot/hold/loadout",async()=>{
  for(const [stake,items] of [[0,false],[10,true]] as const){const s=await setup(stake,items);try{
    const before=s.state();assert.match(before.matchId,/^[0-9a-f-]{36}$/);assert.equal(before.sideToMove,"red");
    assert.equal(before.stateVersion,0);assert.equal(before.moveNumber,0);assert.equal(before.board.length,32);
    assert.deepEqual(before.ownLoadout,items?["scout"]:[]);assert.deepEqual(s.state("black").ownLoadout,items?["seal"]:[]);
    assert.equal(JSON.stringify(before).includes("seal"),false);assert.equal(JSON.stringify(before).includes("requests"),false);
    before.board.length=0;before.ownLoadout.push("tamper");assert.equal(s.state().board.length,32);
    s.set(11000);s.connect("red","replacement");const after=s.state();
    assert.equal(after.matchId,before.matchId);assert.equal(after.clock.turnDeadlineAt,61000);assert.equal(after.clock.remainingMs.red,890000);
    assert.equal(s.service.matchSnapshot(s.identity("red"),"red"),null);
    assert.equal(s.service.matchSnapshot({roomCode:"OTHER2",seat:"red"},"replacement"),null);
    await s.service.setReady("ABC234","red",true);
    assert.equal(s.stats().holds,stake?1:0);assert.equal(s.stats().snapshots,items?1:0);
  }finally{await s.service.onModuleDestroy();}}
});

test("Match: nước hợp lệ, ăn quân, counters và bản cũ không mutate",async()=>{
 const s=await setup();try{
  const before=s.state();assert.equal(s.move("red",{row:6,col:0},{row:5,col:0}).ok,true);
  assert.equal(s.move("black",{row:3,col:0},{row:4,col:0}).ok,true);
  assert.equal(s.move("red",{row:5,col:0},{row:4,col:0}).ok,true);
  assert.equal(s.state().board.length,31);assert.equal(s.state().captured[0].id,"black-soldier-0");
  assert.equal(s.state().moveNumber,3);assert.equal(s.state().stateVersion,3);assert.equal(before.board.length,32);
 }finally{await s.service.onModuleDestroy();}
});

test("Match: payload sai, sai lượt, tự chiếu, outsider và socket cũ không đổi clock/bàn/version",async()=>{
 const s=await setup();try{
  const before=s.state();
  error(s.action("black","move",s.request({from:{row:3,col:0},to:{row:4,col:0}})),"not_your_turn");
  for(const extra of [{from:{row:6,col:0},to:{row:6,col:1}},{from:{row:9,col:0},to:{row:9,col:1}},
    {from:{row:3,col:0},to:{row:4,col:0}}])error(s.action("red","move",s.request(extra)),"illegal_move");
  for(const extra of [{from:null,to:{}},{from:{row:6,col:0},to:{row:10,col:0}},{from:{row:6,col:0},to:{row:5,col:0},board:[]}])
    error(s.action("red","move",s.request(extra)),"invalid_match_request");
  error(s.action("red","resign",s.request({matchId:randomUUID()})),"match_not_found");
  error(s.service.matchAction({roomCode:"OTHER2",seat:"red"},"red","resign",s.request()),"socket_not_active");
  const staleSocketRequest=s.request();s.service.claimSocket(s.identity("red"),"new");
  error(s.service.matchAction(s.identity("red"),"red","resign",staleSocketRequest),"socket_not_active");
  s.connect("red","new");assert.deepEqual(s.state().board,before.board);assert.equal(s.state().stateVersion,0);
  assert.equal(s.state().clock.turnDeadlineAt,before.clock.turnDeadlineAt);
  const pieces=[piece("rg","red","general",9,4),piece("bg","black","general",0,4),piece("shield","red","rook",5,4)];
  s.room.game={pieces,sideToMove:"red",lastMove:null,revision:0,result:getGameStatus(pieces,"red")};
  error(s.move("red",{row:5,col:4},{row:5,col:3}),"illegal_move");assert.equal(s.state().stateVersion,0);
 }finally{await s.service.onModuleDestroy();}
});

test("Match: concurrent moves, idempotency sống hết trận, conflict payload/action và stale version",async()=>{
 const s=await setup();try{
  const req=s.request({from:{row:6,col:0},to:{row:5,col:0}});
  const results=await Promise.all([Promise.resolve().then(()=>s.action("red","move",req)),Promise.resolve().then(()=>s.action("red","move",s.request({...req,requestId:randomUUID()})))]);
  assert.equal(results[0].ok,true);error(results[1],"stale_version");assert.equal(s.state().moveNumber,1);
  s.set(11000);assert.deepEqual(s.action("red","move",req),results[0]);assert.equal(s.state().clock.turnDeadlineAt,61000);
  error(s.action("red","move",{...req,to:{row:4,col:0}}),"request_id_conflict");
  error(s.action("red","resign",{matchId:req.matchId,requestId:req.requestId,expectedVersion:0}),"request_id_conflict");
  const legacy=s.service.move(s.identity("red"),"red",{requestId:req.requestId,expectedRevision:1,pieceId:"red-soldier-2",to:{row:5,col:2}});
  assert.ok(!legacy.ok&&legacy.code==="REQUEST_ID_CONFLICT");
  for(let i=0;i<260;i++)s.action("red","move",s.request({from:{row:6,col:2},to:{row:5,col:2}}));
  assert.deepEqual(s.action("red","move",req),results[0]);assert.equal(s.state().moveNumber,1);
 }finally{await s.service.onModuleDestroy();}
});

test("Match: sát/đúng/sau deadline; timeout ưu tiên resign/draw accept",async()=>{
 for(const at of [60999,61000,61001]){const s=await setup();try{
  s.set(at);const ack=s.move("red",{row:6,col:0},{row:5,col:0});assert.equal(ack.ok,at<61000);
  assert.equal(s.state().moveNumber,at<61000?1:0);if(at>=61000)assert.equal(s.state().reason,"turn_timeout");
 }finally{await s.service.onModuleDestroy();}}
 for(const kind of ["resign","draw_accept"] as const){const s=await setup();try{
  s.set(55000);assert.equal(s.action("red","draw_offer").ok,true);const id=s.state().drawOffer!.id;
  s.set(61000);error(s.action("black",kind,s.request(kind==="draw_accept"?{offerId:id}:{})),"match_not_active");
  assert.equal(s.state().reason,"turn_timeout");assert.equal(s.state().drawOffer!.status,"closed");assert.equal(s.state().clock.stoppedAt,61000);
 }finally{await s.service.onModuleDestroy();}}
});

test("Draw: tạo, đồng ý, retry; chỉ đối thủ phản hồi; clock chạy và dừng khi chốt",async()=>{
 const s=await setup();try{
  const req=s.request();assert.equal(s.action("red","draw_offer",req).ok,true);
  assert.deepEqual(s.action("red","draw_offer",req),{ok:true,requestId:req.requestId,stateVersion:1});
  assert.equal(s.state().drawCounts.red,1);assert.equal(s.state().drawOffer!.expiresAt,16000);
  error(s.action("black","draw_offer"),"draw_offer_already_pending");
  error(s.action("red","draw_accept",s.request({offerId:req.requestId})),"draw_offer_forbidden");
  error(s.service.matchAction({roomCode:"OTHER2",seat:"black"},"black","draw_accept",s.request({offerId:req.requestId})),"socket_not_active");
  s.set(11000);assert.equal(s.state().clock.remainingMs.red,890000);
  const accept=s.request({offerId:req.requestId});assert.equal(s.action("black","draw_accept",accept).ok,true);
  assert.equal(s.state().reason,"agreement");assert.equal(s.state().status,"finished");assert.equal(s.state().clock.stoppedAt,11000);
  error(s.action("black","draw_accept",accept),"match_not_active");assert.equal(s.room.game!.revision,1);
 }finally{await s.service.onModuleDestroy();}
});

test("Draw: từ chối, cooldown, hết hạn đúng 15s tự động, reconnect không reset",async()=>{
 const s=await setup();try{
  const req=s.request();assert.equal(s.action("red","draw_offer",req).ok,true);
  s.set(5000);s.connect("red","new");assert.equal(s.state().drawOffer!.expiresAt,16000);
  assert.equal(s.action("black","draw_reject",s.request({offerId:req.requestId})).ok,true);
  error(s.action("red","draw_offer"),"draw_offer_cooldown");
  assert.equal(s.action("black","draw_offer").ok,true);assert.deepEqual(s.state().drawCounts,{red:1,black:1});
  s.set(20000);s.flush();assert.equal(s.state().drawOffer!.status,"expired");assert.equal(s.state().status,"active");
  error(s.action("red","draw_accept",s.request({offerId:s.state().drawOffer!.id})),"draw_offer_expired");
  assert.equal(s.state().clock.turnDeadlineAt,61000);assert.equal(s.state().clock.remainingMs.red,881000);
 }finally{await s.service.onModuleDestroy();}
});

test("Draw: 3 lần mỗi bên, cooldown đúng 60s và retry không reset expiry",async()=>{
 const s=await setup();try{
  for(let i=0;i<3;i++){
   // Đi hai nước trong mỗi phút để không vi phạm hạn lượt thật.
   if(i){s.set(1000+i*60000-30000);assert.equal(s.move("red",{row:6-i+1,col:0},{row:6-i,col:0}).ok,true);
    s.set(1000+i*60000);assert.equal(s.move("black",{row:3+i-1,col:8},{row:3+i,col:8}).ok,true);}
   for(const side of ["red","black"] as const){const req=s.request();const ack=s.action(side,"draw_offer",req);assert.equal(ack.ok,true);
    assert.deepEqual(s.action(side,"draw_offer",req),ack);assert.equal(s.state().drawOffer!.createdAt,1000+i*60000);
    assert.equal(s.action(side==="red"?"black":"red","draw_reject",s.request({offerId:req.requestId})).ok,true);}
  }
  assert.deepEqual(s.state().drawCounts,{red:3,black:3});
  error(s.action("red","draw_offer"),"draw_offer_limit_reached");error(s.action("black","draw_offer"),"draw_offer_limit_reached");
 }finally{await s.service.onModuleDestroy();}
});

test("Match: chiếu, hóa giải bằng quân khác, chiếu bí và hết nước không chiếu",async()=>{
 for(const reason of ["checkmate","stalemate"]){const s=await setup();try{
  const pieces=[piece("bg","black","general",0,4),piece("rg","red","general",9,3),piece("r1","red","rook",1,0),
    ...(reason==="checkmate"?[piece("moving","red","rook",2,1)]:[piece("r3","red","rook",2,3),piece("moving","red","rook",3,5)])];
  s.room.game={pieces,sideToMove:"red",lastMove:null,revision:0,result:getGameStatus(pieces,"red")};
  assert.equal(s.move("red",reason==="checkmate"?{row:2,col:1}:{row:3,col:5},reason==="checkmate"?{row:0,col:1}:{row:2,col:5}).ok,true);
  assert.equal(s.state().reason,reason);assert.equal(s.state().clock.runningSide,null);
  error(s.action("black","resign"),"match_not_active");
 }finally{await s.service.onModuleDestroy();}}
 const s=await setup();try{
  const pieces=[piece("bg","black","general",0,4),piece("rg","red","general",9,3),piece("rr","red","rook",0,0),piece("br","black","rook",2,2)];
  s.room.game={pieces,sideToMove:"black",lastMove:null,revision:0,result:getGameStatus(pieces,"black")};
  assert.equal(s.state().inCheck,true);assert.equal(s.action("black","draw_offer").ok,true);
  assert.equal(s.move("black",{row:2,col:2},{row:0,col:2}).ok,true);assert.equal(s.room.game!.result.status,"playing");
 }finally{await s.service.onModuleDestroy();}
});

test("Match: resign retry, DB ghi kết quả/payout lỗi giữ pending và retry quyết toán đúng một lần",async()=>{
 for(const recordFailure of [true,false]){const s=await setup(10);try{
  s.fail(recordFailure,!recordFailure);const req=s.request();const ack=s.action("red","resign",req);assert.equal(ack.ok,true);
  await s.room.settlementFlight;assert.equal(s.state().status,"result_pending");assert.equal(s.stats().payouts,0);
  assert.equal(s.room.betStatus,recordFailure?"held":"result_pending");
  assert.deepEqual(s.action("red","resign",req),ack);s.fail(false);await s.service.retrySettlements();
  assert.equal(s.state().status,"finished");assert.equal(s.stats().payouts,1);assert.equal(s.room.game!.revision,1);
  await s.service.retrySettlements();assert.equal(s.stats().payouts,1);
 }finally{await s.service.onModuleDestroy();}}
});

test("Draw: agreement dùng wager refund một lần, không tạo thưởng hoặc dùng item",async()=>{
 const s=await setup(10,true);try{
  const offer=s.request();s.action("red","draw_offer",offer);s.action("black","draw_accept",s.request({offerId:offer.requestId}));
  await s.room.settlementFlight;assert.equal(s.room.betStatus,"refunded");assert.equal(s.stats().payouts,1);
  assert.deepEqual(s.stats().durable,{status:"draw",reason:"agreement"});assert.equal(s.stats().holds,1);assert.equal(s.stats().snapshots,1);
 }finally{await s.service.onModuleDestroy();}
});

test("Match: request xen giữa ghi kết quả và payout không thể sửa bàn hoặc chốt lại",async()=>{
 for(const stage of ["recordResult","settle"] as const){const s=await setup(10);let release=()=>{};try{
  const betting=(s.service as unknown as {betting:BettingService}).betting;
  const originalRecord=betting.recordResult.bind(betting),originalSettle=betting.settle.bind(betting);
  let entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{entered=resolve;});
  if(stage==="recordResult")betting.recordResult=async(...args)=>{entered();await gate;return originalRecord(...args);};
  else betting.settle=async id=>{entered();await gate;return originalSettle(id);};
  const req=s.request();const ack=s.action("red","resign",req);await waiting;
  const before=s.state();assert.equal(before.status,"result_pending");assert.equal(s.stats().payouts,0);
  error(s.move("black",{row:3,col:0},{row:4,col:0}),"match_not_active");
  error(s.action("black","draw_offer"),"match_not_active");assert.deepEqual(s.action("red","resign",req),ack);
  assert.deepEqual(s.state().board,before.board);assert.equal(s.room.game!.revision,1);
  release();await s.room.settlementFlight;assert.equal(s.state().status,"finished");assert.equal(s.stats().payouts,1);
 }finally{release();await s.service.onModuleDestroy();}}
});

test("Match: accept/resign đồng thời và callback timeout cũ chỉ chốt một kết quả",async()=>{
 for(const first of ["draw_accept","resign"] as const){const s=await setup(10);try{
  const oldTimer=[...s.tasks][0].run;
  const offer=s.request();s.action("red","draw_offer",offer);
  const version=s.state().stateVersion,matchId=s.state().matchId;
  const accept={matchId,expectedVersion:version,requestId:randomUUID(),offerId:offer.requestId};
  const resign={matchId,expectedVersion:version,requestId:randomUUID()};
  const acceptCall=()=>s.action("black","draw_accept",accept),resignCall=()=>s.action("red","resign",resign);
  const callbacks=first==="draw_accept"?[acceptCall,resignCall]:[resignCall,acceptCall];
  const acks=await Promise.all(callbacks.map(fn=>Promise.resolve().then(fn)));
  assert.equal(acks[0].ok,true);error(acks[1],"match_not_active");await s.room.settlementFlight;
  const before=s.state();s.set(61000);oldTimer();assert.equal(s.state().reason,first==="draw_accept"?"agreement":"resignation");
  assert.equal(s.state().stateVersion,before.stateVersion);assert.equal(s.stats().payouts,1);assert.equal(s.room.game!.revision,1);
 }finally{await s.service.onModuleDestroy();}}
});

test("Match: đầu hàng xử lý băng qua deadline không thắng timeout",async t=>{
 const s=await setup();try{
  const req=s.request(),original=gameHelpers.resignRoomGame;
  t.mock.method(gameHelpers,"resignRoomGame",(...args:Parameters<typeof original>)=>{
   const next=original(...args);s.set(61000);return next;
  });
  s.set(60999);error(s.action("red","resign",req),"game_finished");
  assert.equal(s.state().reason,"turn_timeout");assert.equal(s.state().clock.stoppedAt,61000);assert.equal(s.room.game!.revision,1);
 }finally{await s.service.onModuleDestroy();}
});

for (const action of ["move", "resign"] as const) {
 test(`Match: ${action} phải từ chối version cũ nếu cầu hòa hết hạn trong lúc xử lý`,async t=>{
  for (const phase of ["entry", "commit"] as const) {
   const s=await setup();let restore=()=>{};
   try {
    assert.equal(s.action("red","draw_offer").ok,true);
    s.set(15999);
    const req=s.request(action==="move"?{from:{row:6,col:0},to:{row:5,col:0}}:{});
    const before=s.state();
    if (phase==="entry" && action==="move") {
     const original=s.service.move.bind(s.service);
     const mock=t.mock.method(s.service,"move",(...args:Parameters<typeof original>)=>{s.set(16000);return original(...args);});
     restore=()=>mock.mock.restore();
    } else if (phase==="entry") {
     const original=s.service.resign.bind(s.service);
     const mock=t.mock.method(s.service,"resign",(...args:Parameters<typeof original>)=>{s.set(16000);return original(...args);});
     restore=()=>mock.mock.restore();
    } else if (action==="move") {
     const original=gameHelpers.nextRoomGame;
     const mock=t.mock.method(gameHelpers,"nextRoomGame",(...args:Parameters<typeof original>)=>{const next=original(...args);s.set(16000);return next;});
     restore=()=>mock.mock.restore();
    } else {
     const original=gameHelpers.resignRoomGame;
     const mock=t.mock.method(gameHelpers,"resignRoomGame",(...args:Parameters<typeof original>)=>{const next=original(...args);s.set(16000);return next;});
     restore=()=>mock.mock.restore();
    }
    const ack=s.action("red",action,req);error(ack,"stale_version");
    assert.ok(!ack.ok && ack.currentVersion===before.stateVersion+1);
    assert.deepEqual(s.state().board,before.board);assert.equal(s.state().moveNumber,0);
    assert.equal(s.state().status,"active");assert.equal(s.state().drawOffer!.status,"expired");
    assert.equal(s.state().clock.turnStartedAt,before.clock.turnStartedAt);
    assert.equal(s.state().clock.turnDeadlineAt,before.clock.turnDeadlineAt);
    assert.deepEqual(s.action("red",action,req),ack);
    restore();assert.equal(s.action("red",action,{...req,requestId:randomUUID(),expectedVersion:s.state().stateVersion}).ok,true);
   } finally { restore();await s.service.onModuleDestroy(); }
  }
 });
}
