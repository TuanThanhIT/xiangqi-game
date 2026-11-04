import { isRoomThemeId } from "./room-theme";
import type { RoomThemeId } from "./room-theme";

export type Seat = "red" | "black";
export interface RoomSession { roomCode: string; seatToken: string; seat: Seat; nickname: string }
export interface StoredSession extends RoomSession { version: 1 }
export interface PublicPlayer { nickname: string; side: Seat; connected: boolean }
export interface RoomSnapshot { roomCode: string; themeId: RoomThemeId; players: { red: PublicPlayer; black: PublicPlayer | null } }
export interface RoomIdentity { roomCode: string; seat: Seat }

export const errorMessages = {
  INVALID_REQUEST: "Kiểm tra biệt danh (1–30 ký tự), phong cách và định dạng yêu cầu.",
  INVALID_ROOM_CODE: "Mã phòng không hợp lệ.",
  INVALID_JSON: "Dữ liệu JSON không hợp lệ.",
  ROOM_NOT_FOUND: "Phòng không tồn tại.",
  ROOM_FULL: "Phòng đã đủ hai người.",
  ROOM_CODE_UNAVAILABLE: "Chưa thể tạo mã phòng. Vui lòng thử lại sau.",
  INTERNAL_ERROR: "Backend gặp lỗi nội bộ.",
};
export const errorStatuses: Record<keyof typeof errorMessages, number> = {
  INVALID_REQUEST: 400, INVALID_ROOM_CODE: 400, INVALID_JSON: 400,
  ROOM_NOT_FOUND: 404, ROOM_FULL: 409, ROOM_CODE_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
export const isCode = (value: unknown): value is string => typeof value === "string" && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(value);
export const isSeat = (value: unknown): value is Seat => value === "red" || value === "black";
export function isNickname(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= 30;
}
export function isSession(value: unknown): value is RoomSession {
  return record(value) && keys(value, ["roomCode", "seatToken", "seat", "nickname"]) &&
    isCode(value.roomCode) && typeof value.seatToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.seatToken) &&
    isSeat(value.seat) && isNickname(value.nickname);
}
export function isStoredSession(value: unknown): value is StoredSession {
  if (!record(value) || value.version !== 1) return false;
  const { version, ...session } = value;
  return version === 1 && isSession(session);
}
export function isIdentity(value: unknown): value is RoomIdentity {
  return record(value) && keys(value, ["roomCode", "seat"]) && isCode(value.roomCode) && isSeat(value.seat);
}
function isPlayer(value: unknown, side: Seat): value is PublicPlayer {
  return record(value) && keys(value, ["nickname", "side", "connected"]) &&
    isNickname(value.nickname) && value.side === side && typeof value.connected === "boolean";
}
export function isSnapshot(value: unknown): value is RoomSnapshot {
  return record(value) && keys(value, ["roomCode", "themeId", "players"]) && isCode(value.roomCode) && isRoomThemeId(value.themeId) &&
    record(value.players) && keys(value.players, ["red", "black"]) && isPlayer(value.players.red, "red") &&
    (value.players.black === null || isPlayer(value.players.black, "black"));
}
export function isBackendError(value: unknown, status: number): value is { statusCode: number; code: keyof typeof errorMessages; message: string } {
  return record(value) && keys(value, ["statusCode", "code", "message"]) && value.statusCode === status &&
    typeof value.code === "string" && Object.hasOwn(errorStatuses, value.code) &&
    errorStatuses[value.code as keyof typeof errorMessages] === status && typeof value.message === "string";
}
export function isSocketError(value: unknown): value is { code: "INVALID_HANDSHAKE" | "AUTH_FAILED" | "INTERNAL_ERROR"; message: string } {
  return record(value) && keys(value, ["code", "message"]) &&
    ["INVALID_HANDSHAKE", "AUTH_FAILED", "INTERNAL_ERROR"].includes(String(value.code)) && typeof value.message === "string";
}
export function isReplaced(value: unknown): boolean {
  return record(value) && keys(value, ["code", "message"]) && value.code === "SEAT_REPLACED" && typeof value.message === "string";
}
