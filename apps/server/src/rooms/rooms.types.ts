import type { RoomGame } from "./room-game";
import type { CachedMove } from "./move-request";
export interface RoomSeat { nickname: string; token: string; activeSocketId: string | null; attached: boolean; requests: Map<string, CachedMove> }
export interface Room { code: string; red: RoomSeat; black: RoomSeat | null; game: RoomGame | null }
export interface PublicGameState { roomCode: string; game: RoomGame | null; playEnabled: boolean }
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
  players: { red: PublicPlayer; black: PublicPlayer | null };
}
