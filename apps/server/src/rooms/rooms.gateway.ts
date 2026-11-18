import { OnModuleDestroy, Optional } from "@nestjs/common";
import { SessionService } from "../auth/session/session.service";
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
import type { MatchAction, MatchAck } from "./match-engine";
import type { MatchChatAck } from "./match-chat";

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
  private unsubscribeDeparture?: () => void;
  private unsubscribeChat?:()=>void;

  constructor(private readonly rooms: RoomsService, @Optional() private readonly sessions?: SessionService) {}

  afterInit(server: Namespace): void {
    this.server = server;
    server.use((socket, next) => { void (async () => {
      try {
        const auth: unknown = socket.handshake.auth;
        if (typeof auth !== "object" || auth === null || Array.isArray(auth) ||
            ![2,3].includes(Object.keys(auth).length) || Object.keys(auth).some(key=>!["roomCode","seatToken","accessToken"].includes(key)) || !("roomCode" in auth) || !("seatToken" in auth) ||
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
        const accountId = this.rooms.accountForSeat(identity);
        if (accountId) {
          const token = "accessToken" in auth && typeof auth.accessToken === "string" ? auth.accessToken : "";
          let authenticated = false;
          try { authenticated = (await this.sessions?.authenticate(`Bearer ${token}`))?.id === accountId; } catch { /* safe handshake error */ }
          if (!authenticated || !this.rooms.authenticate(auth.roomCode,auth.seatToken)) {
            next(connectionError("AUTH_FAILED","Phiên tài khoản hoặc ghế không hợp lệ.")); return;
          }
        }
        socket.data.identity = identity;
        socket.handshake.auth = {}; // Không giữ bản sao token trong metadata socket.
        next();
      } catch {
        next(connectionError("INTERNAL_ERROR", "Không thể kết nối phòng."));
      }
    })(); });
    this.unsubscribeDeparture = this.rooms.onDeparture(event => {
      const target = event.side === "red" ? this.server.to(this.channel(event.roomCode)) : event.socketId ? this.server.to(event.socketId) : null;
      target?.emit("room:left",{code:event.side === "red" ? "ROOM_CLOSED" : "ROOM_LEFT"});
      target?.disconnectSockets(true);
    });
    this.unsubscribe = this.rooms.onRoomChange((code) => {
      this.server.to(this.channel(code)).emit("room:state", this.rooms.publicState(code));
      this.server.to(this.channel(code)).emit("game:state", this.rooms.publicGameState(code));
      // Không broadcast snapshot riêng vào room channel: mỗi ghế có loadout khác nhau.
      for (const socket of this.server.sockets.values()) {
        const identity = socket.data.identity as SeatIdentity | undefined;
        if (identity?.roomCode !== code) continue;
        const snapshot=this.rooms.matchSnapshot(identity,socket.id);
        if (!snapshot) continue;
        socket.emit("match:state",snapshot);
        if (snapshot.inCheck && snapshot.status === "active") socket.emit("match:check",{matchId:snapshot.matchId,stateVersion:snapshot.stateVersion,side:snapshot.sideToMove});
        if (snapshot.status !== "active") socket.emit("match:ended",snapshot);
        if (snapshot.drawOffer) socket.emit("match:draw:state",{matchId:snapshot.matchId,stateVersion:snapshot.stateVersion,offer:snapshot.drawOffer});
      }
    });
    this.unsubscribeChat=this.rooms.onChatEvent(event=>{
      const matchId=(event.payload as {matchId?:unknown}).matchId;if(typeof matchId!=="string")return;
      for(const socket of this.server.sockets.values()){
        const identity=socket.data.identity as SeatIdentity|undefined;
        if(identity&&this.rooms.canReceiveChat(identity,socket.id,matchId))socket.emit(event.name,event.payload);
      }
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

  onModuleDestroy(): void { this.unsubscribe?.(); this.unsubscribeDeparture?.(); this.unsubscribeChat?.(); }
  @SubscribeMessage("game:resign")
  handleResign(@ConnectedSocket() socket: RoomSocket, @MessageBody() payload: unknown): ResignAck {
    try {
      if (!socket.connected || !socket.data.identity) return resignFailure("SOCKET_NOT_ACTIVE", null);
      return this.rooms.resign(socket.data.identity, socket.id, payload);
    } catch { return resignFailure("INTERNAL_ERROR", null); }
  }

  private channel(code: string): string { return `room:${code}`; }

  @SubscribeMessage("match:snapshot")
  handleMatchSnapshot(@ConnectedSocket() socket: RoomSocket, @MessageBody() payload?: unknown): unknown {
    try {
      if (!socket.connected || !socket.data.identity) return {ok:false,code:"socket_not_active"};
      if (payload !== undefined && (typeof payload !== "object" || payload === null || Array.isArray(payload) || Object.keys(payload).length !== 0)) {
        return {ok:false,code:"invalid_match_snapshot_request"};
      }
      const snapshot=this.rooms.matchSnapshot(socket.data.identity,socket.id);
      return snapshot?{ok:true,snapshot}:{ok:false,code:"match_not_found"};
    } catch { return {ok:false,code:"internal_error"}; }
  }
  @SubscribeMessage("match:chat:send")
  handleChatSend(@ConnectedSocket() socket:RoomSocket,@MessageBody() payload:unknown):MatchChatAck {
    try{return socket.connected&&socket.data.identity?this.rooms.chatSend(socket.data.identity,socket.id,payload):{ok:false,requestId:null,code:"CHAT_FORBIDDEN"};}
    catch{return {ok:false,requestId:null,code:"INTERNAL_ERROR"};}
  }
  @SubscribeMessage("match:chat:snapshot")
  handleChatSnapshot(@ConnectedSocket() socket:RoomSocket,@MessageBody() payload:unknown):unknown {
    try{return socket.connected&&socket.data.identity?this.rooms.chatSnapshot(socket.data.identity,socket.id,payload):{ok:false,code:"CHAT_FORBIDDEN"};}
    catch{return {ok:false,code:"INTERNAL_ERROR"};}
  }

  private matchAction(socket: RoomSocket, action: MatchAction, payload: unknown): MatchAck {
    try {
      if (!socket.connected || !socket.data.identity) return {ok:false,requestId:null,code:"socket_not_active"};
      return this.rooms.matchAction(socket.data.identity,socket.id,action,payload);
    } catch { return {ok:false,requestId:null,code:"internal_error"}; }
  }
  @SubscribeMessage("match:move")
  handleMatchMove(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown): MatchAck { return this.matchAction(socket,"move",payload); }
  @SubscribeMessage("match:resign")
  handleMatchResign(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown): MatchAck { return this.matchAction(socket,"resign",payload); }
  @SubscribeMessage("match:draw:offer")
  handleDrawOffer(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown): MatchAck { return this.matchAction(socket,"draw_offer",payload); }
  @SubscribeMessage("match:draw:accept")
  handleDrawAccept(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown): MatchAck { return this.matchAction(socket,"draw_accept",payload); }
  @SubscribeMessage("match:draw:reject")
  handleDrawReject(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown): MatchAck { return this.matchAction(socket,"draw_reject",payload); }
  @SubscribeMessage("match:item:use")
  async handleItemUse(@ConnectedSocket() socket: RoomSocket,@MessageBody() payload: unknown):Promise<MatchAck>{
    try{
      if(!socket.connected||!socket.data.identity)return {ok:false,requestId:null,code:"socket_not_active"};
      return await this.rooms.useItem(socket.data.identity,socket.id,payload);
    }catch{return {ok:false,requestId:null,code:"internal_error"};}
  }
}
