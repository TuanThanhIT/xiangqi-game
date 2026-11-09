import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomsService } from "../src/rooms/rooms.service";
import type { RoomClock } from "../src/rooms/room-clock";
import type { Room } from "../src/rooms/rooms.types";
import type { AuthProfile } from "../src/auth/session/session.service";
import * as gameHelpers from "../src/rooms/room-game";

const profile = (id:string):AuthProfile => ({id,email:`${id}@example.test`,nickname:id,
  avatar:{id:"default",name:"Default",assetPath:null}});
function setup(start = true, totalMinutes = 15) {
  let now=1_000;
  const tasks=new Set<{at:number;callback:()=>void}>();
  const clock:RoomClock={now:()=>now,schedule(callback,delay){
    const task={at:now+delay,callback}; tasks.add(task); return ()=>{tasks.delete(task);};
  }};
  const service=new RoomsService(()=>"ABC234",clock);
  const red=service.createCasual(profile("red"),"earth",totalMinutes);
  service.joinCasual(red.roomCode,profile("black"));
  const identity=(seat:"red"|"black")=>({roomCode:red.roomCode,seat});
  const connect=(seat:"red"|"black",socket:string=seat)=>{
    service.claimSocket(identity(seat),socket); service.markSocketAttached(identity(seat),socket);
  };
  connect("red");connect("black");
  if(start){service.setReady(red.roomCode,"red",true);service.setReady(red.roomCode,"black",true);}
  const room=()=>(service as unknown as {rooms:Map<string,Room>}).rooms.get(red.roomCode)!;
  const state=()=>service.publicGameState(red.roomCode);
  const move=(side:"red"|"black",pieceId=side+"-soldier-0",row=side==="red"?5:4,col=0)=>
    service.move(identity(side),side,{requestId:randomUUID(),expectedRevision:state().game!.revision,pieceId,to:{row,col}});
  return {service,red,identity,connect,room,state,move,tasks,now:()=>now,set:(value:number)=>{now=value;},
    flush(){for(const task of [...tasks])if(task.at<=now){tasks.delete(task);task.callback();}}};
}
function rounds(s:ReturnType<typeof setup>,elapsed:number,count:number){
  for(let i=0;i<count;i++){
    s.set(s.now()+elapsed);
    assert.equal(s.move("red","red-back-1",i%2===0?7:9,i%2===0?2:1).ok,true);
    s.set(s.now()+elapsed);
    assert.equal(s.move("black","black-back-1",i%2===0?2:0,i%2===0?2:1).ok,true);
  }
}

test("Clock configuration: owner only, allowed levels, ready lock and fixed after start",()=>{
  const s=setup(false);try{
    assert.deepEqual(s.service.publicState(s.red.roomCode).timeControl,{totalMs:900_000,turnMs:60_000});
    assert.equal(s.state().clock,undefined);
    const change=(id:string,minutes:number)=>s.service.setTimeControl(s.red.roomCode,id,minutes);
    for(const minutes of [5,10,15,20,30]){change("red",minutes);assert.equal(s.service.publicState(s.red.roomCode).timeControl!.totalMs,minutes*60_000);}
    for(const minutes of [0,7,15.5,Infinity,NaN])assert.throws(()=>change("red",minutes));
    assert.throws(()=>change("black",5),{response:{code:"NOT_ROOM_OWNER"}});
    assert.throws(()=>change("outside",5),{response:{code:"NOT_ROOM_MEMBER"}});
    s.service.setReady(s.red.roomCode,"red",true);
    assert.throws(()=>change("red",5),{response:{code:"PLAYERS_READY"}});
    s.service.setReady(s.red.roomCode,"red",false);s.service.setReady(s.red.roomCode,"black",true);
    assert.throws(()=>change("red",5),{response:{code:"PLAYERS_READY"}});
    s.service.setReady(s.red.roomCode,"black",false);change("red",10);
    s.service.setReady(s.red.roomCode,"red",true);s.service.setReady(s.red.roomCode,"black",true);
    assert.equal(s.state().clock!.totalMs,600_000);
    assert.throws(()=>change("red",5),{response:{code:"GAME_ALREADY_STARTED"}});
  }finally{s.service.onModuleDestroy();}
});
test("Clock: red starts, legal moves debit only mover; invalid/retried moves never restart turn",()=>{
  const s=setup();try{
    assert.equal(s.state().clock!.runningSide,"red");assert.equal(s.state().clock!.turnDeadlineAt,61_000);
    assert.equal(s.state().clock!.totalDeadlineAt,901_000);
    s.set(11_000);const invalid=s.move("red","red-soldier-0",6,1);
    assert.equal(invalid.ok,false);assert.equal(s.state().clock!.turnStartedAt,1_000);
    assert.deepEqual(s.state().clock!.remainingMs,{red:890_000,black:900_000});
    assert.equal(s.move("red").ok,true);
    assert.equal(s.state().clock!.runningSide,"black");assert.equal(s.state().clock!.turnDeadlineAt,71_000);
    s.set(16_000);assert.deepEqual(s.state().clock!.remainingMs,{red:890_000,black:895_000});
    assert.equal(s.move("red").ok,false);assert.equal(s.state().clock!.turnStartedAt,11_000);
    assert.equal(s.move("black").ok,true);assert.equal(s.state().clock!.runningSide,"red");
    const snapshot=s.state();snapshot.clock!.remainingMs.red=0;
    assert.equal(s.state().clock!.remainingMs.red,890_000);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: exact turn deadline rejects move; timer alone ends and freezes once",()=>{
  for(const viaTimer of [true,false]){const s=setup();try{
    let notifications=0;s.service.onRoomChange(()=>notifications++);
    s.set(61_000);
    if(viaTimer)s.flush();else assert.equal(s.move("red").ok,false);
    assert.deepEqual(s.state().game!.result,{status:"finished",winner:"black",loser:"red",reason:"turn_timeout"});
    assert.equal(s.state().game!.revision,1);assert.equal(s.state().clock!.stoppedAt,61_000);
    assert.deepEqual(s.state().clock!.remainingMs,{red:840_000,black:900_000});
    assert.equal(notifications,1);assert.equal(s.tasks.size,0);
    s.set(200_000);s.connect("red","new");s.flush();
    assert.equal(s.state().game!.revision,1);assert.equal(s.state().clock!.remainingMs.red,840_000);
    assert.equal(s.state().playEnabled,false);
  }finally{s.service.onModuleDestroy();}}
});
test("Clock: just-before deadline succeeds; processing crossing deadline is rejected",t=>{
  const s=setup();try{
    s.set(60_999);assert.equal(s.move("red").ok,true);
    assert.equal(s.state().clock!.remainingMs.red,840_001);
    assert.equal(s.state().clock!.turnDeadlineAt,120_999);
    const original=gameHelpers.nextRoomGame;
    t.mock.method(gameHelpers,"nextRoomGame",(...args:Parameters<typeof original>)=>{
      const next=original(...args);s.set(120_999);return next;
    });
    s.set(120_998);assert.equal(s.move("black").ok,false);
    assert.equal(s.state().game!.lastMove!.pieceId,"red-soldier-0");
    assert.equal(s.state().game!.revision,2);
    assert.deepEqual(s.state().game!.result,{status:"finished",winner:"red",loser:"black",reason:"turn_timeout"});
  }finally{s.service.onModuleDestroy();}
});
test("Clock: total expiry precedes turn; exact total/turn tie prefers total",()=>{
  for(const elapsed of [55_000,48_000]){const s=setup(true,5);try{
    rounds(s,elapsed,5);
    const deadline=s.state().clock!.totalDeadlineAt;
    assert.ok(deadline<=s.state().clock!.turnDeadlineAt);
    s.set(deadline);s.flush();
    assert.deepEqual(s.state().game!.result,{status:"finished",winner:"black",loser:"red",reason:"total_timeout"});
    assert.equal(s.state().clock!.remainingMs.red,0);
    assert.equal(s.state().clock!.stoppedAt,deadline);assert.equal(s.tasks.size,0);
  }finally{s.service.onModuleDestroy();}}
});
test("Clock: reconnect and old socket disconnect never restore time; clock runs offline",()=>{
  const s=setup();try{
    s.set(11_000);s.service.releaseSocket(s.identity("red"),"red");
    s.set(21_000);s.connect("red","replacement");
    assert.equal(s.state().clock!.remainingMs.red,880_000);assert.equal(s.state().clock!.turnDeadlineAt,61_000);
    assert.equal(s.service.releaseSocket(s.identity("red"),"red"),false);
    s.set(31_000);s.service.releaseSocket(s.identity("red"),"replacement");
    s.set(61_000);s.flush();
    assert.deepEqual(s.state().game!.result,{status:"finished",winner:"black",loser:"red",reason:"turn_timeout"});
    s.set(70_000);s.connect("red","again");assert.equal(s.state().game!.revision,1);
    assert.equal(s.state().clock!.remainingMs.red,840_000);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: delayed timers select earliest decisive deadline; clock wins exact disconnect tie",()=>{
  for(const offlineAt of [20_000,61_000,70_000]){const s=setup();try{
    s.service.releaseSocket(s.identity("black"),"black");
    // Seed an earlier/later disconnect deadline to test arbitration independently
    // of today's fixed 60s reconnect window / 60s maximum turn.
    s.room().black!.offlineDeadline=offlineAt;
    s.set(100_000);s.flush();
    const expected=offlineAt<61_000 ? "disconnect_timeout" : "turn_timeout";
    assert.equal((s.state().game!.result as {reason:string}).reason,expected);
    assert.equal(s.state().clock!.stoppedAt,Math.min(offlineAt,61_000));
    assert.equal(s.state().game!.revision,1);assert.equal(s.tasks.size,0);
  }finally{s.service.onModuleDestroy();}}
});
test("Clock: offline opponent pending its own grace period is not a premature disconnect win",()=>{
  const s=setup();try{
    s.service.releaseSocket(s.identity("black"),"black");
    s.set(11_000);s.service.releaseSocket(s.identity("red"),"red");
    s.room().black!.offlineDeadline=21_000;
    s.set(31_000);s.flush();assert.equal(s.state().game!.result.status,"playing");
    s.set(100_000);s.flush();
    assert.equal((s.state().game!.result as {reason:string}).reason,"turn_timeout");
    assert.equal(s.state().clock!.stoppedAt,61_000);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: resignation freezes time and cached successful move does not debit twice",()=>{
  const s=setup();try{
    const req={requestId:randomUUID(),expectedRevision:0,pieceId:"red-soldier-0",to:{row:5,col:0}};
    s.set(11_000);const ack=s.service.move(s.identity("red"),"red",req);assert.equal(ack.ok,true);
    s.set(21_000);assert.deepEqual(s.service.move(s.identity("red"),"red",req),ack);
    assert.deepEqual(s.state().clock!.remainingMs,{red:890_000,black:890_000});
    assert.equal(s.service.resign(s.identity("red"),"red",{requestId:randomUUID()}).ok,true);
    assert.equal(s.state().clock!.runningSide,null);assert.equal(s.state().clock!.stoppedAt,21_000);
    s.set(500_000);s.flush();assert.equal(s.state().game!.revision,2);
    assert.deepEqual(s.state().clock!.remainingMs,{red:890_000,black:890_000});assert.equal(s.tasks.size,0);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: exact total deadline rejects a move even if its timer has not run",()=>{
  const s=setup(true,5);try{
    rounds(s,55_000,5);s.set(s.state().clock!.totalDeadlineAt);
    const ack=s.move("red","red-back-1",9,1);
    assert.ok(!ack.ok && ack.code==="GAME_FINISHED");
    assert.equal((s.state().game!.result as {reason:string}).reason,"total_timeout");
    assert.equal(s.state().game!.revision,11);assert.equal(s.tasks.size,0);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: a cancelled old timer cannot expire a new turn or repeat a result",()=>{
  const s=setup();try{
    const old=[...s.tasks][0].callback;
    s.set(11_000);assert.equal(s.move("red").ok,true);
    s.set(61_000);old();assert.equal(s.state().game!.result.status,"playing");
    assert.equal(s.state().clock!.turnDeadlineAt,71_000);
    s.set(71_000);s.flush();const ended=s.state();old();
    assert.deepEqual(s.state(),ended);assert.equal(ended.game!.revision,2);
    s.service.onModuleDestroy();assert.equal(s.tasks.size,0);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: both expired disconnect deadlines can cancel before the chess deadline",()=>{
  const s=setup();try{
    s.service.releaseSocket(s.identity("red"),"red");s.service.releaseSocket(s.identity("black"),"black");
    s.room().red.offlineDeadline=21_000;s.room().black!.offlineDeadline=31_000;
    s.set(100_000);s.flush();
    assert.deepEqual(s.state().game!.result,{status:"cancelled",reason:"both_disconnected"});
    assert.equal(s.state().clock!.stoppedAt,31_000);assert.equal(s.state().game!.revision,1);
  }finally{s.service.onModuleDestroy();}
});
test("Clock: a reconnect resolves pending disconnect only at reconnect time",()=>{
  for(const reconnectedAt of [31_000,61_000]){const s=setup();try{
    s.service.releaseSocket(s.identity("black"),"black");s.service.releaseSocket(s.identity("red"),"red");
    s.room().black!.offlineDeadline=21_000;s.room().red.offlineDeadline=81_000;
    s.set(reconnectedAt);s.connect("red","replacement");
    const result=s.state().game!.result as {reason:string};
    assert.equal(result.reason,reconnectedAt<61_000?"disconnect_timeout":"turn_timeout");
    assert.equal(s.state().clock!.stoppedAt,reconnectedAt);assert.equal(s.state().game!.revision,1);
  }finally{s.service.onModuleDestroy();}}
});
