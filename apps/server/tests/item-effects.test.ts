import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, isInCheck, isLegalMove } from "@xiangqi/rules";
import { createRoomGame } from "../src/rooms/room-game";
import { publicClock, startGameClock } from "../src/rooms/game-clock";
import { afterItemMove, casualResult, createItemState, ItemRejected, refundTimeSaver, simulateItem } from "../src/items/item-effects";

const use=(code:Parameters<typeof simulateItem>[5],target?:string,now=1000,state=createItemState(),game=createRoomGame(),clock=startGameClock(300000,1000))=>
 simulateItem(game,clock,state,"red","red-account",code,target,now,game.revision+1);

test("10 item effects: scout, clocks, dispels, shield/seal and revive",()=>{
 const scout=use("scout","black-soldier-0");assert.ok(scout.scout);assert.ok(scout.scout!.destinations.length>0);
 const saver=use("time_saver");assert.equal(saver.items.saver?.acceptedAt,1000);
 const refunded=refundTimeSaver(saver.clock,saver.items,"red",11000);assert.equal(publicClock(refunded,11000).remainingMs.red,300000);
 const pressured=use("time_pressure");assert.equal(pressured.clock.remainingMs.black,285000);assert.equal(pressured.clock.turnMs,60000);
 const elapsedClock=startGameClock(300000,1000);const extended=use("time_extension",undefined,11000,createItemState(),createRoomGame(),elapsedClock);
 assert.equal(publicClock(extended.clock,11000).remainingMs.red,300000);
 const calm=use("calm");assert.equal(calm.clock.turnMs,75000);assert.equal(calm.clock.remainingMs.red,300000);
 const shield=use("shield","red-soldier-0");assert.equal(shield.items.effects[0].effectCode,"shield");
 const sealed=use("seal","black-back-0");assert.equal(sealed.items.effects[0].effectCode,"seal");
 const unsealState=createItemState();unsealState.effects=[{...sealed.items.effects[0],targetPieceId:"red-soldier-0"}];
 const unsealed=use("unseal","red-soldier-0",1000,unsealState);assert.equal(unsealed.items.effects.length,0);
 const breakState=createItemState();breakState.effects=[{...shield.items.effects[0],targetPieceId:"black-soldier-0"}];
 const broken=use("shield_breaker","black-soldier-0",1000,breakState);assert.equal(broken.items.effects.length,0);
 const game=createRoomGame(),dead=game.pieces.find(p=>p.id==="red-soldier-0")!;
 game.pieces=game.pieces.filter(p=>p.id!==dead.id);game.captured=[dead];
 const revived=use("revive",dead.id,1000,createItemState(),game);assert.ok(revived.game.pieces.some(p=>p.id===dead.id));
});

test("targets, no-effect, duplicate effects and clean expiry are rejected/handled",()=>{
 assert.throws(()=>use("shield","red-back-4"),ItemRejected);
 assert.throws(()=>use("seal","black-back-4"),ItemRejected);
 assert.throws(()=>use("time_extension"),ItemRejected);
 const shield=use("shield","red-soldier-0");shield.items.used.red=[];shield.items.usedTurn=null;
 assert.throws(()=>use("shield","red-soldier-0",1000,shield.items),ItemRejected);
 const afterOwn=afterItemMove(shield.items,shield.game);assert.equal(afterOwn.effects.length,1);
 const afterOpponent=afterItemMove(afterOwn,shield.game);assert.equal(afterOpponent.effects.length,0);
});

test("Phong ấn vô hiệu quân chiếu; Khiên chặn ăn; hồi sinh không được để Tướng còn bị chiếu",()=>{
 const game=createRoomGame();game.pieces=[
  createInitialPieces().find(p=>p.id==="black-back-4")!,createInitialPieces().find(p=>p.id==="red-back-4")!,
  {...createInitialPieces().find(p=>p.id==="black-back-0")!,position:{row:7,col:4}},
  {...createInitialPieces().find(p=>p.id==="red-back-0")!,position:{row:7,col:3}},
  {...createInitialPieces().find(p=>p.id==="red-soldier-4")!,position:{row:5,col:4}},
 ];game.captured=[];
 assert.equal(isInCheck(game.pieces,"red"),true);
 const seal=use("seal","black-back-0",1000,createItemState(),game);assert.equal(isInCheck(game.pieces,"red",seal.items.effects),false);
 const shield=use("shield","red-back-0",1000,createItemState(),game);
 assert.equal(isLegalMove(game.pieces,"black","black-back-0",{row:7,col:3},shield.items.effects),false);
 const dead=createInitialPieces().find(p=>p.id==="red-soldier-0")!;game.captured=[dead];
 assert.throws(()=>use("revive",dead.id,1000,createItemState(),game),error=>error instanceof ItemRejected&&error.code==="revive_in_check");
});

test("Khiên và Phong ấn cùng tồn tại; gỡ một effect không gỡ effect còn lại",()=>{
 const shield=use("shield","red-soldier-0");const state=structuredClone(shield.items);state.used.red=[];state.usedTurn=null;
 state.effects.push({...state.effects[0],effectCode:"seal",itemCode:"seal",sourceSide:"black"});
 const unsealed=use("unseal","red-soldier-0",1000,state);
 assert.deepEqual(unsealed.items.effects.map(e=>e.effectCode),["shield"]);
});

test("không chốt checkmate khi một Phong ấn trong loadout tạo lại nước hợp lệ",()=>{
 const game=createRoomGame();game.pieces=[
  {id:"bg",side:"black",type:"general",position:{row:0,col:4}},
  {id:"rg",side:"red",type:"general",position:{row:9,col:3}},
  {id:"r1",side:"red",type:"rook",position:{row:1,col:0}},
  {id:"moving",side:"red",type:"rook",position:{row:0,col:1}},
 ];game.sideToMove="black";game.captured=[];
 const clock=startGameClock(300000,1000);clock.activeSide="black";
 assert.equal(casualResult(game,clock,createItemState(),[],1000).status,"finished");
 const rescued=casualResult(game,clock,createItemState(),["seal"],1000);
 assert.equal(rescued.status,"playing");
});
