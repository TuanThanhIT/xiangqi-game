import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException, Optional, OnModuleDestroy } from "@nestjs/common";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Room, SeatResponse, SeatIdentity, PublicRoomState, PublicPlayer } from "./rooms.types";
import type { PublicGameState } from "./rooms.types";
import { isLegalMove } from "@xiangqi/rules";
import { createRoomGame, nextRoomGame, resignRoomGame } from "./room-game";
import { moveFailure, parseMoveRequest, sameMove } from "./move-request";
import type { MoveAck } from "./move-request";
import { rememberAction } from "./action-cache";
import { parseResignRequest, resignFailure } from "./resign-request";
import type { ResignAck } from "./resign-request";
import { ROOM_CLOCK, systemRoomClock } from "./room-clock";
import type { RoomClock } from "./room-clock";
import type { Side } from "@xiangqi/rules";
import type { OnlineGameResult } from "./room-game";
import type { RoomThemeId } from "./room-theme";

// Token DI nội bộ, không lấy từ request hoặc biến môi trường.
export const ROOM_CODE_GENERATOR = Symbol("ROOM_CODE_GENERATOR");
export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly changes = new EventEmitter();

  private closed = false;
  constructor(@Inject(ROOM_CODE_GENERATOR) private readonly generateCode: () => string,
    @Optional() @Inject(ROOM_CLOCK) private readonly clock: RoomClock = systemRoomClock) {}

  private online(player: Room["red"] | null): boolean { return !!(player?.activeSocketId && player.presence); }
  private clearTimer(room: Room): void { room.timerVersion++; room.cancelTimer?.(); room.cancelTimer = null; }
  private scheduleRoom(room: Room, now: number): void {
    this.clearTimer(room);
    if (this.closed || room.game?.result.status !== "playing") return;
    // Chỉ đặt lịch cho deadline tương lai; không lặp lại timer của người đã quá hạn.
    const future = [room.red.offlineDeadline, room.black?.offlineDeadline].filter((d): d is number => typeof d === "number" && d > now);
    if (!future.length) return;
    const version = room.timerVersion;
    room.cancelTimer = this.clock.schedule(() => {
      if (this.closed || this.rooms.get(room.code) !== room || version !== room.timerVersion) return;
      room.cancelTimer = null;
      this.evaluateDeadlines(room, this.clock.now());
      this.notifyChange(room.code);
    }, Math.min(...future) - now);
  }
  private evaluateDeadlines(room: Room, now: number): boolean {
    if (!room.game || room.game.result.status !== "playing") { this.clearTimer(room); return false; }
    const expired = (side: Side) => room[side]?.offlineDeadline !== null &&
      typeof room[side]?.offlineDeadline === "number" && now >= room[side]!.offlineDeadline!;
    const red = expired("red"), black = expired("black");
    let result: OnlineGameResult | null = null;
    if (red && black) result = { status: "cancelled", reason: "both_disconnected" };
    else if (red && this.online(room.black)) result = { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" };
    else if (black && this.online(room.red)) result = { status: "finished", winner: "red", loser: "black", reason: "disconnect_timeout" };
    if (result) room.game = { ...room.game, result, revision: room.game.revision + 1 };
    this.scheduleRoom(room, now);
    return result !== null;
  }
  private refreshDeadlines(room: Room, now: number): void {
    if (room.game?.result.status === "playing") for (const side of ["red", "black"] as const) {
      const player = room[side]; if (!player) continue;
      if (this.online(player)) {
        if (player.offlineDeadline !== null && now < player.offlineDeadline) player.offlineDeadline = null;
      } else if (player.offlineDeadline === null) player.offlineDeadline = now + 60000;
    }
    this.evaluateDeadlines(room, now);
  }
  onModuleDestroy(): void { this.closed = true; for (const room of this.rooms.values()) this.clearTimer(room); }

  create(nickname: string, themeId: RoomThemeId = "earth"): SeatResponse {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.generateCode();
      if (this.rooms.has(code)) continue;
      const red = { nickname, token: randomBytes(32).toString("base64url"), activeSocketId: null, attached: false, presence: false, requests: new Map(), offlineDeadline: null };
      this.rooms.set(code, { code, themeId, red, black: null, game: null, cancelTimer: null, timerVersion: 0 });
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
    const black = { nickname, token, activeSocketId: null, attached: false, presence: false, requests: new Map(), offlineDeadline: null };
    const joined = { ...room, black, game };
    this.rooms.set(code, joined);
    this.refreshDeadlines(joined, this.clock.now());
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
    const room = this.rooms.get(identity.roomCode);
    if (room && this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
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
    const room = this.rooms.get(identity.roomCode)!;
    const now = this.clock.now();
    this.evaluateDeadlines(room, now);
    this.rooms.get(identity.roomCode)![identity.seat]!.activeSocketId = null;
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = false;
    this.rooms.get(identity.roomCode)![identity.seat]!.presence = false;
    this.refreshDeadlines(room, now);
    this.notifyChange(identity.roomCode);
    return true;
  }

  publicState(code: string): PublicRoomState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const publicPlayer = (seat: "red" | "black"): PublicPlayer | null => {
      const player = room[seat];
      return player ? { nickname: player.nickname, side: seat, connected: this.online(player) } : null;
    };
    return { roomCode: code, themeId: room.themeId, players: { red: publicPlayer("red")!, black: publicPlayer("black") } };
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
    const room = this.rooms.get(identity.roomCode)!;
    const now = this.clock.now();
    // Đánh giá trạng thái cũ, cả dấu quá hạn, trước khi kết nối có thể thay đổi kết quả.
    const ended = this.evaluateDeadlines(room, now);
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = true;
    this.rooms.get(identity.roomCode)![identity.seat]!.presence = true;
    this.refreshDeadlines(room, now);
    if (ended) this.notifyChange(room.code);
    return true;
  }

  publicGameState(code: string): PublicGameState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const game = room.game;
    return { roomCode: code, serverNow: this.clock.now(), deadlines: { red: room.red.offlineDeadline, black: room.black?.offlineDeadline ?? null },
      game: game ? structuredClone({ pieces: game.pieces, sideToMove: game.sideToMove,
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
    if (this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
    const request = parseMoveRequest(payload);
    if (!request) return moveFailure("INVALID_MOVE_REQUEST", null);
    const cached = player.requests.get(request.requestId);
    if (cached) return structuredClone(cached.kind === "move" && sameMove(cached.request, request) ? cached.ack :
      moveFailure("REQUEST_ID_CONFLICT", request.requestId, room.game?.revision));
    const game = room.game;
    let ack: MoveAck;
    let next: ReturnType<typeof nextRoomGame> | undefined;
    try {
      if (!game) ack = moveFailure("GAME_NOT_STARTED", request.requestId);
      else if (game.result.status !== "playing") ack = moveFailure("GAME_FINISHED", request.requestId, game.revision);
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
    const entries = rememberAction(player.requests, { kind: "move", request, ack });
    // Chuẩn bị mọi dữ liệu trước khi ghi, không để lại bàn dở dang khi tính luật lỗi.
    if (next) room.game = next;
    player.requests = entries;
    if (next) this.scheduleRoom(room, this.clock.now());
    if (next) this.notifyChange(identity.roomCode);
    return ack;
  }

  // Không kiểm tra lượt hoặc đối thủ online; không await giữa xác thực và commit.
  resign(identity: SeatIdentity, socketId: string, payload: unknown): ResignAck {
    const room = this.rooms.get(identity.roomCode);
    const player = room?.[identity.seat];
    if (!room || !player || !this.ownsSocket(identity, socketId) || !player.attached) {
      return resignFailure("SOCKET_NOT_ACTIVE", null);
    }
    if (this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
    const request = parseResignRequest(payload);
    if (!request) return resignFailure("INVALID_RESIGN_REQUEST", null);
    const cached = player.requests.get(request.requestId);
    if (cached) return structuredClone(cached.kind === "resign" ? cached.ack :
      resignFailure("REQUEST_ID_CONFLICT", request.requestId, room.game?.revision));
    const game = room.game;
    let ack: ResignAck;
    let next: ReturnType<typeof resignRoomGame> | undefined;
    try {
      if (!game) ack = resignFailure("GAME_NOT_STARTED", request.requestId);
      else if (game.result.status !== "playing") ack = resignFailure("GAME_FINISHED", request.requestId, game.revision);
      else {
        next = resignRoomGame(game, identity.seat);
        ack = { ok: true, requestId: request.requestId, appliedRevision: next.revision };
      }
    } catch { ack = resignFailure("INTERNAL_ERROR", request.requestId, game?.revision); }
    const entries = rememberAction(player.requests, { kind: "resign", request, ack });
    if (next) room.game = next;
    player.requests = entries;
    if (next) this.scheduleRoom(room, this.clock.now());
    if (next) this.notifyChange(identity.roomCode);
    return ack;
  }
}
