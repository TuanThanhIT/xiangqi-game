import test from "node:test";
import assert from "node:assert/strict";
import { getLegalMoves, isInCheck, isLegalMove } from "../src/index";
import type { Piece } from "../src/types";

const p=(id:string,side:"red"|"black",type:Piece["type"],row:number,col:number):Piece=>
  ({id,side,type,position:{row:row as Piece["position"]["row"],col:col as Piece["position"]["col"]}});
const board=[p("bg","black","general",0,4),p("rg","red","general",9,4),p("block","red","soldier",5,4),
  p("attacker","black","rook",7,0),p("victim","red","rook",7,4)];

test("Phong ấn chặn di chuyển, ăn và vùng tấn công nhưng quân vẫn cản đường",()=>{
 const checking=[p("bg","black","general",0,4),p("rg","red","general",9,4),p("block","red","soldier",5,4),p("rook","black","rook",9,0)];
 assert.equal(isInCheck(checking,"red"),true);
 assert.equal(isInCheck(checking,"red",[{effectCode:"seal",targetPieceId:"rook"}]),false);
 assert.equal(isLegalMove(board,"black","attacker",{row:7,col:4},[{effectCode:"seal",targetPieceId:"attacker"}]),false);
 assert.equal(getLegalMoves(board,"black",[{effectCode:"seal",targetPieceId:"attacker"}]).some(m=>m.pieceId==="attacker"),false);
});

test("Khiên chặn mọi nước ăn vào mục tiêu nhưng không chặn quân được bảo vệ di chuyển",()=>{
 const shield=[{effectCode:"shield" as const,targetPieceId:"victim"}];
 assert.equal(isLegalMove(board,"black","attacker",{row:7,col:4},shield),false);
 assert.equal(isLegalMove(board,"red","victim",{row:7,col:3},shield),true);
 assert.equal(getLegalMoves(board,"black",shield).some(m=>m.to.row===7&&m.to.col===4),false);
});
