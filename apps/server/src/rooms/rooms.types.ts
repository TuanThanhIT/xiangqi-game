import type { RoomGame } from "./room-game";
import type { MatchSession } from "./match-engine";
export interface Room { match?: MatchSession }
import type { CachedAction } from "./action-cache";
import type { RoomThemeId } from "./room-theme";
import type { GameClock, PublicClock } from "./game-clock";
export interface RoomSeat { nickname: string; token: string; activeSocketId: string | null; attached: boolean; presence: boolean; requests: Map<string, CachedAction>; offlineDeadline: number | null; accountId?: string; avatar?: string | null; ready?: boolean; connectedAt?: number; loadout?:string[] }
export interface RoomBet { stake:number; matchId:string|null; status:"none"|"held"|"result_pending"|"settled"|"refunded"; starting:boolean; pending:boolean }
export interface RoomReward { eligible:boolean; amount:number; status:"pending"|"credited"|"not_eligible"; walletBalance?:number }
export interface Room { code: string; readonly themeId: RoomThemeId; red: RoomSeat; black: RoomSeat | null; game: RoomGame | null; cancelTimer: (() => void) | null; timerVersion: number; totalMinutes?: number; gameClock?: GameClock; stake?:number; matchId?:string; gameMatchId?:string; itemsEnabled?:boolean; betStatus?:RoomBet["status"]; rewardStatus?:RoomReward["status"]; rewardWinnerAccountId?:string|null; rewardWalletBalance?:number|null; starting?:Promise<void>; cleanupPending?:boolean; settlementFlight?:Promise<void> }
export interface PublicGameState { roomCode: string; game: RoomGame | null; playEnabled: boolean; serverNow: number; deadlines: { red: number | null; black: number | null }; clock?: PublicClock; bet?:RoomBet }
export interface SeatResponse {
  roomCode: string;
  seat: "red" | "black";
  nickname: string;
  seatToken: string;
  casual?: true;
}

export interface SeatIdentity { roomCode: string; seat: "red" | "black" }
export interface PublicPlayer { nickname: string; side: "red" | "black"; connected: boolean; ready?: boolean; avatar?: string | null }
export interface PublicRoomState {
  roomCode: string;
  themeId: RoomThemeId;
  casual?: true;
  players: { red: PublicPlayer; black: PublicPlayer | null };
  timeControl?: { totalMs: number; turnMs: number };
  bet?:RoomBet;
  itemsEnabled?:boolean;
}
