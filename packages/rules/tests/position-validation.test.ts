import test from "node:test";
import assert from "node:assert/strict";
import { createInitialPieces, isInCheck, isLegalMove, getLegalMoves, getGameStatus } from "../src/index";
import type { Piece, Side } from "../src/index";

test("Rules: dữ liệu cấu trúc sai bị từ chối trước khi duyệt đường quân",()=>{
  const initial=createInitialPieces();
  const invalid:unknown[]=[null,{},[null],initial.map((p,i)=>i? p:{...p,id:""}),
    [...initial,{...initial[0],id:"duplicate-square"}], [...initial,{...initial[0],position:{row:4,col:4}}],
    initial.map((p,i)=>i?p:{...p,side:"unknown"}),initial.map((p,i)=>i?p:{...p,type:"unknown"}),
    initial.map((p,i)=>i?p:{...p,position:null})];
  for(const row of [-1,10,1.5,NaN,Infinity,"0"])invalid.push(initial.map((p,i)=>i?p:{...p,position:{row,col:0}}));
  for(const data of invalid){
    const board=data as Piece[];
    assert.throws(()=>isInCheck(board,"red"));assert.throws(()=>getLegalMoves(board,"red"));
    assert.throws(()=>getGameStatus(board,"red"));assert.throws(()=>isLegalMove(board,"red","red-soldier-0",{row:5,col:0}));
  }
  assert.throws(()=>isInCheck(initial,"unknown" as Side));
  assert.equal(isLegalMove(initial,"red","red-soldier-0",null as unknown as Piece["position"]),false);
});

test("Rules: Tướng không thoát được nhưng quân khác có thể bắt/chặn nguồn chiếu thì chưa bí",()=>{
 const base:Piece[]=[{id:"bg",side:"black",type:"general",position:{row:0,col:4}},
  {id:"rg",side:"red",type:"general",position:{row:9,col:3}},
  {id:"checking",side:"red",type:"rook",position:{row:0,col:0}},
  {id:"lock",side:"red",type:"rook",position:{row:1,col:0}}];
 assert.equal(getGameStatus(base,"black").status,"finished");
 const block:Piece[]=[...base,{id:"defender",side:"black",type:"rook",position:{row:2,col:2}}];
 assert.equal(getGameStatus(block,"black").status,"playing");
 const moves=getLegalMoves(block,"black");assert.equal(moves.some(m=>m.pieceId==="bg"),false);
 assert.equal(moves.some(m=>m.pieceId==="defender"&&m.to.row===0&&m.to.col===2),true);
 const capture:Piece[]=[...base,{id:"defender",side:"black",type:"rook",position:{row:2,col:0}}];
 assert.equal(isLegalMove(capture,"black","defender",{row:0,col:0}),false); // Xe đỏ hàng 1 cản đường.
 const horse:Piece[]=[...base,{id:"defender",side:"black",type:"horse",position:{row:2,col:1}}];
 assert.equal(isLegalMove(horse,"black","defender",{row:0,col:0}),true);
 assert.equal(getGameStatus(horse,"black").status,"playing");
});
