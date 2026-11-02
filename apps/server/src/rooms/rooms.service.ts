import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Room, SeatResponse, SeatIdentity, PublicRoomState, PublicPlayer } from "./rooms.types";
import type { PublicGameState } from "./rooms.types";
import { isLegalMove } from "@xiangqi/rules";
import { createRoomGame, nextRoomGame } from "./room-game";
import { moveFailure, parseMoveRequest, sameMove } from "./move-request";
import type { MoveAck } from "./move-request";

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
      const red = { nickname, token: randomBytes(32).toString("base64url"), activeSocketId: null, attached: false, requests: new Map() };
      this.rooms.set(code, { code, red, black: null, game: null });
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
    const game = createRoomGame();
    const black = { nickname, token, activeSocketId: null, attached: false, requests: new Map() };
    this.rooms.set(code, { ...room, black, game });
    this.notifyChange(code);
    return { roomCode: code, seat: "black", nickname: black.nickname, seatToken: black.token };
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
    player.attached = false;
    return previous;
  }

  ownsSocket(identity: SeatIdentity, socketId: string): boolean {
    return this.rooms.get(identity.roomCode)?.[identity.seat]?.activeSocketId === socketId;
  }

  releaseSocket(identity: SeatIdentity, socketId: string): boolean {
    if (!this.ownsSocket(identity, socketId)) return false;
    this.rooms.get(identity.roomCode)![identity.seat]!.activeSocketId = null;
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = false;
    this.notifyChange(identity.roomCode);
    return true;
  }

  publicState(code: string): PublicRoomState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const publicPlayer = (seat: "red" | "black"): PublicPlayer | null => {
      const player = room[seat];
      return player ? { nickname: player.nickname, side: seat, connected: player.activeSocketId !== null && player.attached } : null;
    };
    return { roomCode: code, players: { red: publicPlayer("red")!, black: publicPlayer("black") } };
  }

  onRoomChange(listener: (code: string) => void): () => void {
    this.changes.on("room-change", listener);
    return () => { this.changes.off("room-change", listener); };
  }

  notifyChange(code: string): void {
    // Lỗi listener không được biến một thao tác đã ghi thành ack thất bại.
    for (const listener of this.changes.listeners("room-change")) {
      try { listener(code); } catch { /* Không log dữ liệu phòng hoặc token. */ }
    }
  }

  markSocketAttached(identity: SeatIdentity, socketId: string): boolean {
    if (!this.ownsSocket(identity, socketId)) return false;
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = true;
    return true;
  }

  publicGameState(code: string): PublicGameState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const game = room.game;
    return { roomCode: code, game: game ? structuredClone({ pieces: game.pieces, sideToMove: game.sideToMove,
      lastMove: game.lastMove, revision: game.revision, result: game.result }) : null,
      playEnabled: !!(game && game.result.status === "playing" && room.red.attached && room.red.activeSocketId &&
        room.black?.attached && room.black.activeSocketId) };
  }

  // Đồng bộ trong một process: không await từ kiểm tra quyền tới ghi bàn/cache.
  move(identity: SeatIdentity, socketId: string, payload: unknown): MoveAck {
    const room = this.rooms.get(identity.roomCode);
    const player = room?.[identity.seat];
    if (!room || !player || !this.ownsSocket(identity, socketId) || !player.attached) {
      return moveFailure("SOCKET_NOT_ACTIVE", null);
    }
    const request = parseMoveRequest(payload);
    if (!request) return moveFailure("INVALID_MOVE_REQUEST", null);
    const cached = player.requests.get(request.requestId);
    if (cached) return structuredClone(sameMove(cached.request, request) ? cached.ack :
      moveFailure("REQUEST_ID_CONFLICT", request.requestId, room.game?.revision));
    const game = room.game;
    let ack: MoveAck;
    let next: ReturnType<typeof nextRoomGame> | undefined;
    try {
      if (!game) ack = moveFailure("GAME_NOT_STARTED", request.requestId);
      else if (game.result.status === "finished") ack = moveFailure("GAME_FINISHED", request.requestId, game.revision);
      else if (!room.red.attached || !room.red.activeSocketId || !room.black?.attached || !room.black.activeSocketId) {
        ack = moveFailure("PLAYERS_OFFLINE", request.requestId, game.revision);
      } else if (request.expectedRevision !== game.revision) ack = moveFailure("STALE_REVISION", request.requestId, game.revision);
      else if (identity.seat !== game.sideToMove) ack = moveFailure("NOT_YOUR_TURN", request.requestId, game.revision);
      else if (!isLegalMove(game.pieces, identity.seat, request.pieceId, request.to)) {
        ack = moveFailure("ILLEGAL_MOVE", request.requestId, game.revision);
      } else {
        next = nextRoomGame(game, request.pieceId, request.to);
        ack = { ok: true, requestId: request.requestId, appliedRevision: next.revision };
      }
    } catch { ack = moveFailure("INTERNAL_ERROR", request.requestId, game?.revision); }
    const entries = new Map(player.requests);
    entries.set(request.requestId, { request, ack: structuredClone(ack) });
    if (entries.size > 256) entries.delete(entries.keys().next().value!);
    // Chuẩn bị mọi dữ liệu trước khi ghi, không để lại bàn dở dang khi tính luật lỗi.
    if (next) room.game = next;
    player.requests = entries;
    if (next) this.notifyChange(identity.roomCode);
    return ack;
  }
}
