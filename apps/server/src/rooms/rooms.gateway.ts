import { OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, MessageBody, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";
import type { IncomingMessage } from "node:http";
import { RoomsService } from "./rooms.service";
import type { SeatIdentity } from "./rooms.types";
import { SOCKET_ORIGINS, isAllowedSocketOrigin } from "./socket-origin";
import { moveFailure } from "./move-request";
import type { MoveAck } from "./move-request";
import { resignFailure } from "./resign-request";
import type { ResignAck } from "./resign-request";

interface RoomSocketData { identity?: SeatIdentity }
type RoomSocket = Socket<Record<string, never>, Record<string, (...args: unknown[]) => void>, Record<string, never>, RoomSocketData>;

function connectionError(code: string, message: string): Error & { data: { code: string; message: string } } {
  return Object.assign(new Error(message), { data: { code, message } });
}

@WebSocketGateway({
  namespace: "/rooms",
  cors: { origin: SOCKET_ORIGINS },
  allowRequest: (request: IncomingMessage, callback: (error: string | null, success: boolean) => void) => {
    callback(null, isAllowedSocketOrigin(request.headers.origin));
  },
  // Không bật connectionStateRecovery: mọi kết nối phải xác thực lại.
})
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private server!: Namespace;
  private unsubscribe?: () => void;

  constructor(private readonly rooms: RoomsService) {}

  afterInit(server: Namespace): void {
    this.server = server;
    server.use((socket, next) => {
      try {
        const auth: unknown = socket.handshake.auth;
        if (typeof auth !== "object" || auth === null || Array.isArray(auth) ||
            Object.keys(auth).length !== 2 || !("roomCode" in auth) || !("seatToken" in auth) ||
            typeof auth.roomCode !== "string" || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(auth.roomCode) ||
            typeof auth.seatToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(auth.seatToken)) {
          next(connectionError("INVALID_HANDSHAKE", "Thông tin kết nối sai định dạng."));
          return;
        }
        const identity = this.rooms.authenticate(auth.roomCode, auth.seatToken);
        if (!identity) {
          next(connectionError("AUTH_FAILED", "Thông tin kết nối không hợp lệ."));
          return;
        }
        socket.data.identity = identity;
        socket.handshake.auth = {}; // Không giữ bản sao token trong metadata socket.
        next();
      } catch {
        next(connectionError("INTERNAL_ERROR", "Không thể kết nối phòng."));
      }
    });
    this.unsubscribe = this.rooms.onRoomChange((code) => {
      this.server.to(this.channel(code)).emit("room:state", this.rooms.publicState(code));
      this.server.to(this.channel(code)).emit("game:state", this.rooms.publicGameState(code));
    });
  }

  handleConnection(socket: RoomSocket): void {
    // Tự xử lý promise để lỗi không rơi vào logger với dữ liệu handshake.
    void this.attach(socket).catch(() => {
      const identity = socket.data.identity;
      if (identity) this.rooms.releaseSocket(identity, socket.id);
      socket.disconnect(true);
    });
  }

  private async attach(socket: RoomSocket): Promise<void> {
    const identity = socket.data.identity;
    if (!identity || !socket.connected) { socket.disconnect(true); return; }
    const previousId = this.rooms.claimSocket(identity, socket.id);
    if (previousId && previousId !== socket.id) {
      const previous = this.server.sockets.get(previousId);
      if (previous) {
        await previous.leave(this.channel(identity.roomCode));
        previous.emit("room:replaced", { code: "SEAT_REPLACED", message: "Ghế này đã được kết nối ở nơi khác." });
        previous.disconnect(true);
      }
    }
    if (!socket.connected || !this.rooms.ownsSocket(identity, socket.id)) {
      socket.disconnect(true); return;
    }
    await socket.join(this.channel(identity.roomCode));
    // Một kết nối mới hơn có thể đã chiếm ghế trong lúc chờ join.
    if (!socket.connected || !this.rooms.ownsSocket(identity, socket.id)) {
      await socket.leave(this.channel(identity.roomCode));
      socket.disconnect(true); return;
    }
    if (!this.rooms.markSocketAttached(identity, socket.id)) { socket.disconnect(true); return; }
    socket.emit("room:session", { roomCode: identity.roomCode, seat: identity.seat });
    this.rooms.notifyChange(identity.roomCode);
  }

  handleDisconnect(socket: RoomSocket): void {
    if (socket.data.identity) this.rooms.releaseSocket(socket.data.identity, socket.id);
  }

  @SubscribeMessage("game:move")
  handleMove(@ConnectedSocket() socket: RoomSocket, @MessageBody() payload: unknown): MoveAck {
    try {
      if (!socket.connected || !socket.data.identity) return moveFailure("SOCKET_NOT_ACTIVE", null);
      return this.rooms.move(socket.data.identity, socket.id, payload);
    } catch { return moveFailure("INTERNAL_ERROR", null); }
  }

  onModuleDestroy(): void { this.unsubscribe?.(); }
  @SubscribeMessage("game:resign")
  handleResign(@ConnectedSocket() socket: RoomSocket, @MessageBody() payload: unknown): ResignAck {
    try {
      if (!socket.connected || !socket.data.identity) return resignFailure("SOCKET_NOT_ACTIVE", null);
      return this.rooms.resign(socket.data.identity, socket.id, payload);
    } catch { return resignFailure("INTERNAL_ERROR", null); }
  }

  private channel(code: string): string { return `room:${code}`; }
}
