import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";
const render=(C,p)=>renderToStaticMarkup(React.createElement(C,p));

test("14 dấu cố định: góc L đúng phía biên, không di chuyển theo quân; chữ sông có một mô tả truy cập",()=>{
 const Board=loader()("apps/web/src/components/BoardView.tsx").default;
 const props={pieces:createInitialPieces(),selectedPieceId:null,lastMove:null,disabled:false,onActivate(){},onClearSelection(){}};
 const marks=html=>[...html.matchAll(/data-mark-position="(\d+),(\d+)"[^>]*>([\s\S]*?)<\/g>/g)];
 const html=render(Board,props), actual=marks(html);
 assert.equal(actual.length,14);
 const expected=['2,1','2,7','7,1','7,7',...[3,6].flatMap(r=>[0,2,4,6,8].map(c=>`${r},${c}`))];
 assert.deepEqual(actual.map(m=>`${m[1]},${m[2]}`).sort(),expected.sort());
 for(const m of actual){const corners=[...m[3].matchAll(/data-corner="(-?1),(-?1)"/g)];assert.equal(corners.length,m[2]==='0'||m[2]==='8'?2:4);if(m[2]==='0')assert.ok(corners.every(c=>c[1]==='1'));if(m[2]==='8')assert.ok(corners.every(c=>c[1]==='-1'));}
 const pieces=structuredClone(props.pieces);pieces.find(p=>p.id==='red-soldier-0').position.row=5;
 assert.deepEqual(marks(render(Board,{...props,pieces})).map(m=>m[0]),actual.map(m=>m[0]));
 assert.equal((html.match(/>楚河<|>漢界</g)||[]).length,2);
 assert.equal((html.match(/Sở Hà, Hán Giới/g)||[]).length,1);
 assert.ok(html.indexOf('楚河')<html.indexOf('漢界'));
 assert.ok(html.indexOf('board-position-marks')<html.indexOf('class="piece piece--'));
});

test("Thanh đến lượt: Đỏ/Đen đúng lượt, tắt khi offline/chưa đồng bộ/kết thúc; Bạn không đổi theo lượt",()=>{
 const Online=loader()("apps/web/src/features/rooms/OnlineBoard.tsx").default;
 const props={side:'red',authenticatedSide:'red',canPlay:false,canResign:true,selectionEpoch:0,sendMove(){},sendResign(){},players:{red:{nickname:'A',connected:true},black:{nickname:'B',connected:true}}};
 for(const sideToMove of ['red','black'])for(const enabled of [true,false])for(const ended of [true,false]){
 const game={pieces:createInitialPieces(),sideToMove,revision:0,lastMove:null,result:ended?{status:'finished',winner:'red',loser:'black',reason:'resignation'}:{status:'playing',inCheck:false}};
 const html=render(Online,{...props,game,turnHighlightEnabled:enabled});
 assert.equal((html.match(/data-active-turn="true"/g)||[]).length,enabled&&!ended?1:0);
 if(enabled&&!ended){
   assert.ok(html.includes(`xq-player-bar--${sideToMove}" data-active-turn="true"`));
   assert.ok(html.includes('ĐẾN LƯỢT'));
   assert.equal('ĐẾN LƯỢT'.normalize('NFC'),'ĐẾN LƯỢT');
 }
 assert.ok(html.includes('Đọc biệt danh đầy đủ: A, Bạn'));assert.ok(!html.includes('Đọc biệt danh đầy đủ: B, Bạn'));
 }
});

test("Bờ sông dùng cùng texture; hai cầu chỉ trong lề ngoài lưới, trang trí dưới quân",()=>{
 const Board=loader()("apps/web/src/components/BoardView.tsx").default;
 const html=render(Board,{pieces:createInitialPieces(),selectedPieceId:null,lastMove:null,disabled:false,onActivate(){},onClearSelection(){}});
 assert.ok(!html.includes('board-bank'));
 assert.match(html,/class="board-ground"[^>]*><rect x="12" y="12" width="528" height="588"/);
 const bridges=[...html.matchAll(/class="river-bridge" transform="translate\((\d+) (\d+)\)" aria-hidden="true"/g)];
 assert.deepEqual(bridges.map(m=>[+m[1],+m[2]]),[[18,276],[522,276]]);
 assert.equal((html.match(/class="bridge-plank"/g)||[]).length,20);
 assert.equal((html.match(/class="bridge-rail"/g)||[]).length,4);
 assert.ok(html.indexOf('river-bridge')<html.indexOf('class="piece piece--'));
});

test("Badge Hán có tên phe tiếng Việt, không thay tên hoặc điều kiện active",()=>{
 const Player=loader()("apps/web/src/features/rooms/MatchPlayer.tsx").default;
 for(const [seat,symbol,label]of [['red','帥','Đỏ'],['black','將','Đen']]){
 const html=render(Player,{seat,player:{nickname:'Tên dài để kiểm tra',connected:false},own:true,turn:null,active:false});
 assert.ok(html.includes(`aria-label="Phe ${label}"`));assert.ok(html.includes(`aria-hidden="true">${symbol}`));
 assert.ok(html.includes('Offline'));assert.ok(html.includes('· Bạn'));assert.ok(!html.includes('data-active-turn'));
 }
});
