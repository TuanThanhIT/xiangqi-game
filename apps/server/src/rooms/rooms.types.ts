import type { RoomGame } from "./room-game";
import type { CachedAction } from "./action-cache";
import type { RoomThemeId } from "./room-theme";
export interface RoomSeat { nickname: string; token: string; activeSocketId: string | null; attached: boolean; presence: boolean; requests: Map<string, CachedAction>; offlineDeadline: number | null }
export interface Room { code: string; readonly themeId: RoomThemeId; red: RoomSeat; black: RoomSeat | null; game: RoomGame | null; cancelTimer: (() => void) | null; timerVersion: number }
export interface PublicGameState { roomCode: string; game: RoomGame | null; playEnabled: boolean; serverNow: number; deadlines: { red: number | null; black: number | null } }
export interface SeatResponse {
  roomCode: string;
  seat: "red" | "black";
  nickname: string;
  seatToken: string;
}

export interface SeatIdentity { roomCode: string; seat: "red" | "black" }
export interface PublicPlayer { nickname: string; side: "red" | "black"; connected: boolean }
export interface PublicRoomState {
  roomCode: string;
  themeId: RoomThemeId;
  players: { red: PublicPlayer; black: PublicPlayer | null };
}
