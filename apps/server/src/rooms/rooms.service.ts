import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Room, SeatResponse, SeatIdentity, PublicRoomState, PublicPlayer } from "./rooms.types";

// Token DI nội bộ, không lấy từ request hoặc biến môi trường.
export const ROOM_CODE_GENERATOR = Symbol("ROOM_CODE_GENERATOR");
export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, Room>();
  private readonly changes = new EventEmitter();

  constructor(@Inject(ROOM_CODE_GENERATOR) private readonly generateCode: () => string) {}

  create(nickname: string): SeatResponse {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.generateCode();
      if (this.rooms.has(code)) continue;
      const red = { nickname, token: randomBytes(32).toString("base64url"), activeSocketId: null };
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
    room.black = { nickname, token, activeSocketId: null };
    this.notifyChange(code);
    return { roomCode: code, seat: "black", nickname: room.black.nickname, seatToken: room.black.token };
  }

  authenticate(roomCode: string, token: string): SeatIdentity | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    for (const seat of ["red", "black"] as const) {
      const player = room[seat];
      if (player && player.token.length === token.length &&
          timingSafeEqual(Buffer.from(player.token), Buffer.from(token))) {
        return { roomCode, seat };
      }
    }
    return null;
  }

  claimSocket(identity: SeatIdentity, socketId: string): string | null {
    const player = this.rooms.get(identity.roomCode)?.[identity.seat];
    if (!player) throw new Error("Ghế đã xác thực không còn tồn tại");
    const previous = player.activeSocketId;
    player.activeSocketId = socketId;
    return previous;
  }

  ownsSocket(identity: SeatIdentity, socketId: string): boolean {
    return this.rooms.get(identity.roomCode)?.[identity.seat]?.activeSocketId === socketId;
  }

  releaseSocket(identity: SeatIdentity, socketId: string): boolean {
    if (!this.ownsSocket(identity, socketId)) return false;
    this.rooms.get(identity.roomCode)![identity.seat]!.activeSocketId = null;
    this.notifyChange(identity.roomCode);
    return true;
  }

  publicState(code: string): PublicRoomState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const publicPlayer = (seat: "red" | "black"): PublicPlayer | null => {
      const player = room[seat];
      return player ? { nickname: player.nickname, side: seat, connected: player.activeSocketId !== null } : null;
    };
    return { roomCode: code, players: { red: publicPlayer("red")!, black: publicPlayer("black") } };
  }

  onRoomChange(listener: (code: string) => void): () => void {
    this.changes.on("room-change", listener);
    return () => { this.changes.off("room-change", listener); };
  }

  notifyChange(code: string): void {
    this.changes.emit("room-change", code);
  }
}
