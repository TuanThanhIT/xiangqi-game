import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialPieces } from "@xiangqi/rules";
import { loader } from "./load-source.mjs";

function elements(x) {
  if (Array.isArray(x)) return x.flatMap(elements);
  return x?.props ? [x, ...elements(x.props.children)] : [];
}

test("Tên dài trong trận: có điều khiển bàn phím mở đầy đủ, popover liên kết đúng, không dùng title làm cách đọc duy nhất", () => {
  const Lobby = loader()("apps/web/src/features/rooms/RoomLobby.tsx").default;
  const nickname = "TênDàiKhôngKhoảngTrắng123456789";
  const html = renderToStaticMarkup(React.createElement(Lobby, { roomCode: "ABC234", identity: { seat: "red" }, phase: "Đã xác thực", hasGame: true,
    snapshot: { themeId: "earth", players: { red: { nickname, connected: true }, black: null } } }));
  assert.match(html,/popovertarget="player-name-ABC234-red"/i);
  assert.ok(html.includes('popover="auto" id="player-name-ABC234-red"'));
  assert.ok(html.includes('aria-label="Đọc đầy đủ biệt danh phe Đỏ: '+nickname+'"'));
  assert.match(html,/popovertargetaction="hide"/i);
  assert.ok(html.includes("Chưa có người giữ ghế"));
});

test("Thông báo dài và kết quả: vùng cuộn có tên/focus riêng, nút sau trận ở ngoài vùng cuộn, SVG không bị nhân bản", () => {
  const Online = loader({ react: { useState: () => [null,()=>{}] } })("apps/web/src/features/rooms/OnlineBoard.tsx").default;
  const base = { pieces: createInitialPieces(), sideToMove: "red", revision: 1, lastMove: null };
  for (const result of [{status:"playing",inCheck:false}, {status:"finished",winner:"red",loser:"black",reason:"resignation"}, {status:"cancelled",reason:"both_disconnected"}]) {
    const action = React.createElement('button', null, 'Về menu');
    const tree=Online({game:{...base,result},side:"red",canPlay:result.status==="playing",canResign:false,selectionEpoch:0,sendMove(){},sendResign(){},notices:React.createElement('p',null,'Thông báo dài '.repeat(100)),resultActions:action});
    const nodes=elements(tree), body=nodes.find(n=>n.props.className==='xq-feedback-body'), slot=nodes.find(n=>n.props.className==='xq-result-actions-slot');
    assert.equal(body.props.tabIndex,0); assert.equal(body.props.role,'region');
    assert.equal(body.props['aria-label'],'Thông báo và kết quả trận');
    assert.ok(!elements(body).includes(action));
    assert.equal(elements(slot).includes(action),result.status!=="playing");
    assert.equal(nodes.filter(n=>n.type?.name==='BoardView').length,1);
  }
});
