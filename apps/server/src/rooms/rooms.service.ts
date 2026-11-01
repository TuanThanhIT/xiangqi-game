import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomBytes, randomInt } from "node:crypto";
import type { Room, SeatResponse } from "./rooms.types";

// Token DI nội bộ, không lấy từ request hoặc biến môi trường.
export const ROOM_CODE_GENERATOR = Symbol("ROOM_CODE_GENERATOR");
export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, Room>();

  constructor(@Inject(ROOM_CODE_GENERATOR) private readonly generateCode: () => string) {}

  create(nickname: string): SeatResponse {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.generateCode();
      if (this.rooms.has(code)) continue;
      const red = { nickname, token: randomBytes(32).toString("base64url") };
      this.rooms.set(code, { code, red, black: null });
      return { roomCode: code, seat: "red", nickname: red.nickname, seatToken: red.token };
    }
    throw new ServiceUnavailableException({ code: "ROOM_CODE_UNAVAILABLE" });
  }

  // Không await giữa kiểm tra và ghi ghế: nguyên tử trong một process Node.
  join(code: string, nickname: string): SeatResponse {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundException({ code: "ROOM_NOT_FOUND" });
    if (room.black) throw new ConflictException({ code: "ROOM_FULL" });
    let token: string;
    do { token = randomBytes(32).toString("base64url"); } while (token === room.red.token);
    room.black = { nickname, token };
    return { roomCode: code, seat: "black", nickname: room.black.nickname, seatToken: room.black.token };
  }
}
