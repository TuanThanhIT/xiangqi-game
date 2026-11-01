export interface RoomSeat { nickname: string; token: string; activeSocketId: string | null }
export interface Room { code: string; red: RoomSeat; black: RoomSeat | null }
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
