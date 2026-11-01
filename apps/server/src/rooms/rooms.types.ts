export interface RoomSeat { nickname: string; token: string }
export interface Room { code: string; red: RoomSeat; black: RoomSeat | null }
export interface SeatResponse {
  roomCode: string;
  seat: "red" | "black";
  nickname: string;
  seatToken: string;
}
