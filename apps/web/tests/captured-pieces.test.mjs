import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces, getGameStatus } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

const load=loader();
const {getCapturedPieces}=load("apps/web/src/features/board/captured-pieces.ts");
const Trays=load("apps/web/src/components/CapturedTrays.tsx").default;
const html=pieces=>renderToStaticMarkup(React.createElement(Trays,{pieces}));

test("Khai cuộc/chưa có snapshot: khay rỗng hoặc không render, không suy diễn toàn bộ quân bị ăn",()=>{
 assert.deepEqual(getCapturedPieces(createInitialPieces()),{red:[],black:[]});
 assert.equal(getCapturedPieces(null),null);assert.equal(html(null),'');
 assert.equal((html(createInitialPieces()).match(/Chưa có/g)||[]).length,4);
});

test("Suy ra theo ID và phe quân bị ăn; hai quân cùng loại, thứ tự ổn định, không đổi đầu vào hoặc chia sẻ kết quả mutable",()=>{
 const original=createInitialPieces();
 // ID cụ thể lấy từ khai cuộc để không phụ thuộc cách đánh số của type.
 const horses=original.filter(p=>p.side==='black'&&p.type==='horse');
 const ids=new Set([...horses.map(p=>p.id),original.find(p=>p.side==='red'&&p.type==='soldier').id]);
 const pieces=original.filter(p=>!ids.has(p.id)),before=structuredClone(pieces);
 const captured=getCapturedPieces(pieces),again=getCapturedPieces([...pieces].reverse());
 assert.equal(captured.black.length,2);assert.equal(captured.red.length,1);
 assert.deepEqual(captured.black.map(p=>p.id),horses.map(p=>p.id));
 assert.deepEqual(captured,again);assert.deepEqual(pieces,before);
 captured.black[0].position.row=9;assert.notEqual(getCapturedPieces(pieces).black[0].position.row,9);
 assert.notEqual(captured.black[0],again.black[0]);assert.equal(new Set([...captured.black,...captured.red].map(p=>p.id)).size,3);
});

test("Tối đa15 mỗi phe, không có Tướng, danh sách tiếng Việt và chữ Hán; quân không nhận focus/sự kiện",()=>{
 const pieces=createInitialPieces().filter(p=>p.type==='general');
 const captured=getCapturedPieces(pieces);assert.equal(captured.red.length,15);assert.equal(captured.black.length,15);
 const markup=html(pieces);assert.equal((markup.match(/data-captured-id=/g)||[]).length,60);
 assert.ok(!markup.includes('>帥<'));assert.ok(!markup.includes('>將<'));
 assert.ok(markup.includes('Quân Đen bị ăn'));assert.ok(markup.includes('Quân Đỏ bị ăn'));
 assert.ok(markup.includes('không phải thứ tự bị ăn'));assert.ok(markup.includes('>Xe Đen<'));
 assert.equal((markup.match(/focusable="false"/g)||[]).length,60);
 assert.ok(!markup.includes('draggable="true"'));assert.ok(!markup.includes('tabindex'));
 assert.equal((markup.match(/popover="auto"/g)||[]).length,2);
});

test("Fixture rút gọn tắt khay; local capture/reset và online chỉ phản ánh pieces xác nhận",()=>{
 const Local=load("apps/web/src/components/XiangqiBoard.tsx").default;
 const fixtures=load("apps/web/src/dev/endgame-fixtures.ts");
 for(const scenario of ['checkmate','stalemate'])assert.ok(!renderToStaticMarkup(React.createElement(Local,{initialGame:fixtures.createEndgameFixture(scenario)})).includes('xq-captured-trays'));
 const game=load("apps/web/src/features/board/local-game.ts");let state=game.createLocalGame();
 const activate=(row,col)=>{state=game.activateIntersection(state,{row,col},getGameStatus(state.pieces,state.sideToMove));};
 for(const [row,col]of [[6,0],[5,0],[3,0],[4,0],[5,0],[4,0]])activate(row,col);
 assert.equal(getCapturedPieces(state.pieces).black.length,1);assert.equal(getCapturedPieces(state.pieces).red.length,0);
 const before=state.pieces;activate(4,0);activate(2,2);
 assert.equal(state.pieces,before);assert.equal(getCapturedPieces(state.pieces).black.length,1);
 assert.deepEqual(getCapturedPieces(game.createLocalGame().pieces),{red:[],black:[]});
 // Cùng snapshot (retry/reconnect/result đổi) luôn cùng khay; không có animation/state riêng.
 assert.deepEqual(getCapturedPieces(before),getCapturedPieces(structuredClone(before)));
});

test("Online: notice/ack lỗi hoặc kết quả đổi không tự thêm quân; chỉ pieces snapshot mới đổi khay",()=>{
 const Online=load('apps/web/src/features/rooms/OnlineBoard.tsx').default;
 const pieces=createInitialPieces(),base={pieces,sideToMove:'red',revision:0,lastMove:null,result:{status:'playing',inCheck:false}};
 const props={side:'red',authenticatedSide:'red',selectionEpoch:0,canPlay:false,canResign:false,sendMove(){},sendResign(){}};
 const draw=game=>renderToStaticMarkup(React.createElement(Online,{...props,game,notices:React.createElement('p',null,'Nước đi không hợp lệ')}));
 assert.ok(!draw(base).includes('data-captured-id'));
 assert.ok(!draw({...base,result:{status:'finished',winner:'black',loser:'red',reason:'resignation'},revision:1}).includes('data-captured-id'));
 const removed=pieces.find(p=>p.side==='black'&&p.type==='horse').id;
 const confirmed={...base,pieces:pieces.filter(p=>p.id!==removed),revision:1};
 assert.equal((draw(confirmed).match(/data-captured-id=/g)||[]).length,2); // bản desktop và panel mobile
 assert.equal((draw({...confirmed,result:{status:'cancelled',reason:'both_disconnected'},revision:2}).match(/data-captured-id=/g)||[]).length,2);
 assert.equal(pieces.length,32);
});
