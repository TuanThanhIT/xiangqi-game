import type { Piece } from "@xiangqi/rules";

export interface MoveRequest {
  requestId: string;
  expectedRevision: number;
  pieceId: string;
  to: Piece["position"];
}
export const moveErrors = {
  INVALID_MOVE_REQUEST: "Yêu cầu nước đi sai định dạng.",
  SOCKET_NOT_ACTIVE: "Socket không còn giữ ghế hoặc chưa sẵn sàng.",
  GAME_NOT_STARTED: "Trận chưa bắt đầu.",
  PLAYERS_OFFLINE: "Cần cả hai người online để đi quân.",
  GAME_FINISHED: "Trận đã kết thúc.",
  STALE_REVISION: "Bàn cờ đã thay đổi.",
  NOT_YOUR_TURN: "Chưa đến lượt của bạn.",
  ILLEGAL_MOVE: "Nước đi không hợp lệ.",
  REQUEST_ID_CONFLICT: "Request ID đã được dùng cho yêu cầu khác.",
  INTERNAL_ERROR: "Không thể xử lý nước đi.",
};
export type MoveError = keyof typeof moveErrors;
export type MoveAck = { ok: true; requestId: string; appliedRevision: number } |
  { ok: false; requestId: string | null; code: MoveError; message: string; currentRevision?: number };
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
export function parseMoveRequest(value: unknown): MoveRequest | null {
  if (!object(value) || !keys(value, ["requestId", "expectedRevision", "pieceId", "to"]) ||
      typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId) ||
      !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0 ||
      typeof value.pieceId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.pieceId) ||
      !object(value.to) || !keys(value.to, ["row", "col"]) ||
      !Number.isInteger(value.to.row) || !Number.isInteger(value.to.col) ||
      (value.to.row as number) < 0 || (value.to.row as number) > 9 ||
      (value.to.col as number) < 0 || (value.to.col as number) > 8) return null;
  return { requestId: value.requestId.toLowerCase(), expectedRevision: value.expectedRevision as number,
    pieceId: value.pieceId, to: { row: value.to.row as Piece["position"]["row"], col: value.to.col as Piece["position"]["col"] } };
}
export function sameMove(a: MoveRequest, b: MoveRequest): boolean {
  return a.expectedRevision === b.expectedRevision && a.pieceId === b.pieceId && a.to.row === b.to.row && a.to.col === b.to.col;
}
export function moveFailure(code: MoveError, requestId: string | null, currentRevision?: number): MoveAck {
  return { ok: false, requestId, code, message: moveErrors[code], ...(currentRevision === undefined ? {} : { currentRevision }) };
}
