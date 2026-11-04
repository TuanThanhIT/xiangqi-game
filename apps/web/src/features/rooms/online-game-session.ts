import { isGameSnapshot, isMoveAck, isResignAck, moveMessages, resignMessages, sameGame } from "./game-contract";
import type { GameSnapshot, MoveAck, MoveRequest, ResignAck, ResignRequest } from "./game-contract";
import type { Piece, Side } from "@xiangqi/rules";

type Pending = ({ kind: "move"; request: MoveRequest } | { kind: "resign"; request: ResignRequest }) &
  { baseRevision: number; attempts: number; ack: MoveAck | ResignAck | null; unknown: boolean };
export interface OnlineState { snapshot: GameSnapshot | null; receivedAt?: number; synced: boolean; pending: Pending | null; message: string; recovery: boolean }
interface Port {
  connected(): boolean;
  send(request: MoveRequest | ResignRequest, callback: (ack: unknown) => void, kind: "move" | "resign"): void;
  change(state: OnlineState): void;
  schedule(callback: () => void, delay: number): () => void;
  uuid(): string;
  protocolError(): void;
}
/** Một controller cho mỗi phiên phòng. Không chứa token, không tự dựng bàn. */
export class OnlineGameSession {
  private state: OnlineState = { snapshot: null, synced: false, pending: null, message: "", recovery: false };
  private authenticated = false;
  private disposed = false;
  private cancel?: () => void;
  private generation = 0;
  private timerVersion = 0;
  constructor(private readonly roomCode: string, private readonly side: Side, private readonly port: Port) {}
  private publish() { if (!this.disposed) this.port.change(structuredClone(this.state)); }
  private clearTimer() { this.timerVersion++; this.cancel?.(); this.cancel = undefined; }
  private arm(callback: () => void) {
    this.clearTimer(); const version = this.timerVersion;
    this.cancel = this.port.schedule(() => {
      if (this.disposed || version !== this.timerVersion) return;
      this.cancel = undefined; callback();
    }, 5000);
  }
  private failProtocol() {
    this.clearTimer(); this.generation++; this.authenticated = false;
    this.state.synced = false; this.state.message = "Dữ liệu trận không nhất quán. Hãy tải lại trang."; this.state.recovery = true;
    this.publish(); this.port.protocolError();
  }
  private unknown(message = this.state.pending?.kind === "resign" ? "Chưa xác định được kết quả đầu hàng" : "Chưa xác định được kết quả nước đi") {
    this.clearTimer(); this.generation++;
    if (this.state.pending) this.state.pending.unknown = true;
    this.state.message = message; this.state.recovery = true; this.publish();
  }
  authenticatedNow() {
    if (this.disposed) return;
    this.authenticated = true; this.state.synced = false;
    this.clearTimer();
    this.arm(() => {
      if (!this.disposed && !this.state.synced) this.unknown("Chưa đồng bộ được trạng thái trận. Hãy tải lại trang.");
    });
    this.publish();
  }
  disconnected() {
    if (this.disposed) return;
    this.authenticated = false; this.generation++; this.clearTimer(); this.state.synced = false; this.publish();
  }
  reconnectFailed() {
    if (!this.disposed) this.unknown("Không kết nối lại được. Hãy tải lại trang để đồng bộ bàn; hành động đang chờ chưa được xác định kết quả.");
  }
  receiveSnapshot(value: unknown) {
    if (this.disposed || !this.authenticated) return;
    if (!isGameSnapshot(value) || value.roomCode !== this.roomCode) { this.failProtocol(); return; }
    const old = this.state.snapshot?.game, incoming = value.game;
    if (old && (!incoming || incoming.revision < old.revision || (incoming.revision === old.revision && !sameGame(old, incoming)))) {
      this.failProtocol(); return;
    }
    const first = !this.state.synced;
    this.state.snapshot = structuredClone(value); this.state.receivedAt = Date.now(); this.state.synced = true;
    const pending = this.state.pending;
    if (pending?.unknown) { this.publish(); return; }
    if (pending?.ack) { if (first) this.clearTimer(); this.settle(); }
    else if (pending && first) { this.clearTimer(); this.transmit(); }
    else if (!pending) this.clearTimer();
    this.publish();
  }
  canResign(): boolean {
    const game = this.state.snapshot?.game;
    return !this.disposed && this.authenticated && this.port.connected() && this.state.synced && !this.state.recovery &&
      !this.state.pending && !!game && game.result.status === "playing";
  }
  canInteract(): boolean {
    return this.canResign() && !!this.state.snapshot?.playEnabled && this.state.snapshot.game?.sideToMove === this.side;
  }
  sendResign(): boolean {
    if (!this.canResign()) return false;
    this.state.pending = { kind: "resign", request: { requestId: this.port.uuid() }, baseRevision: this.state.snapshot!.game!.revision,
      attempts: 0, ack: null, unknown: false };
    this.state.message = "Đang gửi yêu cầu đầu hàng…"; this.transmit(); this.publish(); return true;
  }
  sendMove(pieceId: string, to: Piece["position"]): boolean {
    if (!this.canInteract()) return false;
    const game = this.state.snapshot!.game!;
    if (!game.pieces.some((p) => p.id === pieceId && p.side === this.side)) return false;
    this.state.pending = { kind: "move", baseRevision: game.revision, request: { requestId: this.port.uuid(), expectedRevision: game.revision, pieceId, to: { ...to } },
      attempts: 0, ack: null, unknown: false };
    this.state.message = "Đang gửi nước đi…"; this.transmit(); this.publish(); return true;
  }
  private transmit() {
    const p = this.state.pending;
    if (!p || p.unknown || p.ack || !this.authenticated || !this.state.synced || !this.port.connected() || this.disposed) return;
    if (p.attempts >= 3) { this.unknown(); return; }
    this.clearTimer(); const generation = ++this.generation; p.attempts++;
    this.arm(() => {
      if (this.disposed || generation !== this.generation) return;
      this.clearTimer();
      if (p.attempts >= 3) this.unknown();
      else { this.state.message = "Chưa nhận được xác nhận; đang thử lại cùng yêu cầu…"; this.transmit(); this.publish(); }
    });
    this.port.send(structuredClone(p.request), (value) => {
      if (this.disposed || generation !== this.generation || this.state.pending !== p || !this.authenticated) return;
      if (!(p.kind === "move" ? isMoveAck(value) : isResignAck(value))) { this.failProtocol(); return; }
      const ack = value as MoveAck | ResignAck;
      if ((ack.requestId !== null && ack.requestId.toLowerCase() !== p.request.requestId.toLowerCase()) ||
          (ack.ok && (p.kind === "move" ? ack.appliedRevision !== p.request.expectedRevision + 1 : ack.appliedRevision <= p.baseRevision))) { this.failProtocol(); return; }
      if (!ack.ok && ack.requestId === null && !["SOCKET_NOT_ACTIVE", p.kind === "move" ? "INVALID_MOVE_REQUEST" : "INVALID_RESIGN_REQUEST", "INTERNAL_ERROR"].includes(ack.code)) {
        this.failProtocol(); return;
      }
      this.clearTimer(); this.generation++; p.ack = ack; this.settle(); this.publish();
    }, p.kind);
  }
  private settle() {
    const p = this.state.pending;
    if (!p?.ack || p.unknown) return;
    const ack = p.ack;
    const target = ack.ok ? ack.appliedRevision : (ack.currentRevision ?? p.baseRevision);
    if (this.state.synced && (this.state.snapshot?.game?.revision ?? -1) >= target) {
      this.clearTimer(); this.state.pending = null;
      const messages = { ...moveMessages, ...resignMessages,
        INTERNAL_ERROR: p.kind === "resign" ? resignMessages.INTERNAL_ERROR : moveMessages.INTERNAL_ERROR };
      this.state.message = ack.ok ? "" : messages[ack.code];
      if (!ack.ok && ["SOCKET_NOT_ACTIVE", "REQUEST_ID_CONFLICT", "INVALID_MOVE_REQUEST", "INVALID_RESIGN_REQUEST", "INTERNAL_ERROR"].includes(ack.code)) this.state.recovery = true;
    } else {
      this.state.message = "Đang chờ đồng bộ bàn từ server…";
      if (!this.cancel) this.arm(() => this.unknown("Chưa đồng bộ được kết quả hành động. Hãy tải lại trang."));
    }
  }
  dispose() { this.disposed = true; this.generation++; this.clearTimer(); }
}
