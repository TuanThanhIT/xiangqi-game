import type { GameStatus, LegalMove, Piece, Side } from "@xiangqi/rules";
import { isCode, isSeat, keys, record } from "./room-contract";

export interface OnlineGame { pieces: Piece[]; sideToMove: Side; lastMove: LegalMove | null; revision: number; result: GameStatus }
export interface GameSnapshot { roomCode: string; game: OnlineGame | null; playEnabled: boolean }
export interface MoveRequest { requestId: string; expectedRevision: number; pieceId: string; to: Piece["position"] }
export const moveMessages = {
  INVALID_MOVE_REQUEST: "Yêu cầu nước đi sai định dạng.", SOCKET_NOT_ACTIVE: "Kết nối không còn quyền đi quân.",
  GAME_NOT_STARTED: "Trận chưa bắt đầu.", PLAYERS_OFFLINE: "Cần cả hai người online để đi quân.",
  GAME_FINISHED: "Trận đã kết thúc.", STALE_REVISION: "Đã đồng bộ bàn; yêu cầu cũ không được áp dụng lại. Không thể kết luận lần gửi đầu chưa từng thành công.",
  NOT_YOUR_TURN: "Chưa đến lượt của bạn.", ILLEGAL_MOVE: "Nước đi không hợp lệ.",
  REQUEST_ID_CONFLICT: "Request ID đã được dùng cho yêu cầu khác.", INTERNAL_ERROR: "Backend chưa thể xử lý nước đi.",
};
export type MoveAck = { ok: true; requestId: string; appliedRevision: number } |
  { ok: false; requestId: string | null; code: keyof typeof moveMessages; message: string; currentRevision?: number };
const revision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function position(v: unknown): v is Piece["position"] {
  return record(v) && keys(v, ["row", "col"]) && typeof v.row === "number" && Number.isInteger(v.row) && v.row >= 0 && v.row <= 9 &&
    typeof v.col === "number" && Number.isInteger(v.col) && v.col >= 0 && v.col <= 8;
}
function piece(v: unknown): v is Piece {
  return record(v) && keys(v, ["id", "side", "type", "position"]) && id(v.id) && isSeat(v.side) &&
    typeof v.type === "string" && ["rook", "horse", "elephant", "advisor", "general", "cannon", "soldier"].includes(v.type) && position(v.position);
}
function lastMove(v: unknown): v is LegalMove {
  return record(v) && keys(v, ["pieceId", "from", "to"]) && id(v.pieceId) && position(v.from) && position(v.to) &&
    (v.from.row !== v.to.row || v.from.col !== v.to.col);
}
export function isGameSnapshot(v: unknown): v is GameSnapshot {
  if (!record(v) || !keys(v, ["roomCode", "game", "playEnabled"]) || !isCode(v.roomCode) || typeof v.playEnabled !== "boolean") return false;
  if (v.game === null) return !v.playEnabled;
  const g = v.game;
  if (!record(g) || !keys(g, ["pieces", "sideToMove", "lastMove", "revision", "result"]) ||
      !Array.isArray(g.pieces) || g.pieces.length < 2 || g.pieces.length > 32 || !g.pieces.every(piece) ||
      !isSeat(g.sideToMove) || !revision(g.revision) || !(g.lastMove === null || lastMove(g.lastMove))) return false;
  const pieces = g.pieces as Piece[];
  if (new Set(pieces.map((p) => p.id)).size !== pieces.length ||
      new Set(pieces.map((p) => `${p.position.row},${p.position.col}`)).size !== pieces.length ||
      ["red", "black"].some((side) => pieces.filter((p) => p.side === side && p.type === "general").length !== 1)) return false;
  if ((g.revision === 0) !== (g.lastMove === null)) return false;
  if (g.lastMove !== null) {
    const move = g.lastMove as LegalMove;
    const moving = pieces.find((p) => p.id === move.pieceId);
    if (!moving || moving.side === g.sideToMove || moving.position.row !== move.to.row || moving.position.col !== move.to.col) return false;
  }
  const r = g.result;
  if (!record(r)) return false;
  if (r.status === "playing") return keys(r, ["status", "sideToMove", "inCheck"]) && r.sideToMove === g.sideToMove && typeof r.inCheck === "boolean";
  return r.status === "finished" && keys(r, ["status", "winner", "loser", "reason"]) &&
    isSeat(r.winner) && r.loser === g.sideToMove && r.winner !== r.loser &&
    (r.reason === "checkmate" || r.reason === "stalemate") && !v.playEnabled;
}
export function isMoveAck(v: unknown): v is MoveAck {
  if (!record(v)) return false;
  if (v.ok === true) return keys(v, ["ok", "requestId", "appliedRevision"]) && isUuid(v.requestId) && revision(v.appliedRevision) && v.appliedRevision > 0;
  return v.ok === false && keys(v, ["ok", "requestId", "code", "message", ...(Object.hasOwn(v, "currentRevision") ? ["currentRevision"] : [])]) &&
    (v.requestId === null || isUuid(v.requestId)) && typeof v.code === "string" && Object.hasOwn(moveMessages, v.code) &&
    typeof v.message === "string" && (!Object.hasOwn(v, "currentRevision") || revision(v.currentRevision));
}

// So sánh các giá trị có ý nghĩa; không phụ thuộc thứ tự key hoặc thứ tự mảng quân.
export function sameGame(a: OnlineGame, b: OnlineGame): boolean {
  if (a.revision !== b.revision || a.sideToMove !== b.sideToMove || a.pieces.length !== b.pieces.length) return false;
  for (const p of a.pieces) {
    const q = b.pieces.find((candidate) => candidate.id === p.id);
    if (!q || p.side !== q.side || p.type !== q.type || p.position.row !== q.position.row || p.position.col !== q.position.col) return false;
  }
  const x = a.lastMove, y = b.lastMove;
  if (x === null || y === null) { if (x !== y) return false; }
  else if (x.pieceId !== y.pieceId || x.from.row !== y.from.row || x.from.col !== y.from.col || x.to.row !== y.to.row || x.to.col !== y.to.col) return false;
  const r = a.result, s = b.result;
  return r.status === "playing" ? s.status === "playing" && r.sideToMove === s.sideToMove && r.inCheck === s.inCheck :
    s.status === "finished" && r.winner === s.winner && r.loser === s.loser && r.reason === s.reason;
}
