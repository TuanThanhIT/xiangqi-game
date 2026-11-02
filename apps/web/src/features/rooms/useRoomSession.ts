"use client";

import { useEffect, useRef, useState } from "react";
import { requestRoom } from "./room-api";
import { createRoomSocket } from "./room-socket";
import { clearRoomSession, readRoomSession, saveRoomSession } from "./room-storage";
import { isCode, isIdentity, isNickname, isReplaced, isSnapshot, isSocketError, record } from "./room-contract";
import type { RoomIdentity, RoomSession, RoomSnapshot } from "./room-contract";
import { OnlineGameSession } from "./online-game-session";
import type { OnlineState } from "./online-game-session";
import type { Piece } from "@xiangqi/rules";

export function useRoomSession() {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [identity, setIdentity] = useState<RoomIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("Chưa kết nối");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const busy = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const gameSession = useRef<OnlineGameSession | null>(null);
  const [online, setOnline] = useState<OnlineState>({ snapshot: null, synced: false, pending: null, message: "", recovery: false });
  const [selectionEpoch, setSelectionEpoch] = useState(0);

  useEffect(() => {
    alive.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const stored = readRoomSession(window.sessionStorage);
        setSession(stored.session); setWarning(stored.warning);
      } catch { setWarning("Không truy cập được sessionStorage; phiên chỉ giữ trong bộ nhớ."); }
      setReady(true);
    });
    return () => {
      active = false; alive.current = false;
      requestController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let terminal = false;
    let verified = false;
    let connectionGeneration = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let socket: ReturnType<typeof createRoomSocket>;
    try { socket = createRoomSocket(session); } catch {
      queueMicrotask(() => { if (active) { setError("Chưa cấu hình địa chỉ backend Socket.IO hợp lệ."); setPhase("Lỗi cấu hình"); } });
      return () => { active = false; };
    }
    const game = new OnlineGameSession(session.roomCode, session.seat, {
      connected: () => active && !terminal && verified && socket.connected,
      send: (request, callback) => {
        // Volatile không buffer nước đi khi transport không sẵn sàng; controller quản lý retry.
        if (active && !terminal && verified && socket.connected) socket.volatile.emit("game:move", request, callback);
      },
      change: (state) => { if (active && !terminal) setOnline(state); },
      schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
      uuid: () => crypto.randomUUID(),
      protocolError: () => stop("Dữ liệu trận không nhất quán. Hãy tải lại trang để đồng bộ.", false),
    });
    gameSession.current = game;
    function stop(message: string, revoke: boolean) {
      if (!active || terminal) return;
      terminal = true;
      game.dispose();
      setSelectionEpoch((value) => value + 1);
      setOnline((state) => ({ ...state, synced: false, pending: null, recovery: true }));
      clearTimeout(deadline);
      socket.io.reconnection(false);
      socket.auth = {};
      socket.disconnect();
      setError(message); setPhase("Đã dừng kết nối"); setIdentity(null);
      if (revoke) {
        let cleared = false;
        try { cleared = clearRoomSession(window.sessionStorage); } catch { /* thông báo an toàn bên dưới */ }
        if (!cleared) setWarning("Không thể xóa phiên lưu. Hãy xóa dữ liệu trang hoặc đóng tab trước khi tải lại để tránh chiếm lại ghế.");
        setSession(null); setSnapshot(null);
      }
    }
    function onConnect() {
      if (!active || terminal) return;
      const generation = ++connectionGeneration;
      verified = false; setIdentity(null); setPhase("Đang xác thực ghế"); setError("");
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        if (active && !terminal && !verified && generation === connectionGeneration) {
          stop("Không nhận được xác nhận ghế đúng hạn. Hãy tải lại trang để thử kết nối lại bằng phiên đã lưu.", false);
        }
      }, 8000);
    }
    function onSession(data: unknown) {
      if (!active || terminal) return;
      if (!isIdentity(data) || data.roomCode !== session!.roomCode || data.seat !== session!.seat) {
        stop("Server trả thông tin ghế không khớp phiên đã lưu.", true); return;
      }
      clearTimeout(deadline); verified = true; setIdentity(data); setPhase("Đã kết nối và xác thực"); setError("");
      game.authenticatedNow();
    }
    function onState(data: unknown) {
      if (!active || terminal || !verified) return;
      if (!isSnapshot(data) || data.roomCode !== session!.roomCode || data.players[session!.seat]?.nickname !== session!.nickname) {
        stop("Dữ liệu trạng thái phòng không đúng hợp đồng.", false); return;
      }
      setSnapshot(data);
    }
    function onReplaced(data: unknown) {
      if (!isReplaced(data)) { stop("Thông báo thay thế ghế không đúng hợp đồng.", true); return; }
      stop("Ghế này đã được kết nối ở tab hoặc cửa sổ khác. Tab này đã dừng kết nối.", true);
    }
    function onConnectError(err: unknown) {
      if (!active || terminal) return;
      const data: unknown = record(err) ? err.data : undefined;
      if (data !== undefined) {
        if (!isSocketError(data)) { stop("Lỗi xác thực không đúng hợp đồng.", false); return; }
        stop(data.code === "AUTH_FAILED" ? "Phiên phòng không còn hợp lệ hoặc server đã khởi động lại."
          : data.code === "INVALID_HANDSHAKE" ? "Thông tin phiên phòng không hợp lệ." : "Backend chưa thể xác thực kết nối.",
          data.code === "AUTH_FAILED" || data.code === "INVALID_HANDSHAKE");
        return;
      }
      setPhase("Không kết nối được backend"); setError("Kiểm tra backend, địa chỉ cấu hình và origin frontend cổng 3000.");
    }
    function onDisconnect(reason: string) {
      if (!active || terminal) return;
      clearTimeout(deadline); verified = false; setIdentity(null);
      connectionGeneration++;
      game.disconnected(); setSelectionEpoch((value) => value + 1);
      setPhase(reason === "io server disconnect" ? "Server đã ngắt kết nối; không tự chiếm lại ghế" : "Mất kết nối, đang thử lại");
    }
    function onAttempt() { if (active && !terminal) setPhase("Đang kết nối lại"); }
    function onFailed() { if (active && !terminal) { setPhase("Đã dừng thử kết nối; tải lại trang để thử lại phiên đã lưu"); game.reconnectFailed(); } }
    function onGameState(data: unknown) { if (active && !terminal && verified) game.receiveSnapshot(data); }
    socket.on("connect", onConnect); socket.on("room:session", onSession); socket.on("room:state", onState);
    socket.on("game:state", onGameState);
    socket.on("room:replaced", onReplaced); socket.on("connect_error", onConnectError); socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onAttempt); socket.io.on("reconnect_failed", onFailed);
    socket.connect();
    return () => {
      active = false; clearTimeout(deadline);
      game.dispose(); if (gameSession.current === game) gameSession.current = null;
      socket.off("game:state", onGameState);
      socket.off("connect", onConnect); socket.off("room:session", onSession); socket.off("room:state", onState);
      socket.off("room:replaced", onReplaced); socket.off("connect_error", onConnectError); socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onAttempt); socket.io.off("reconnect_failed", onFailed);
      socket.io.reconnection(false); socket.auth = {}; socket.disconnect();
    };
  }, [session]);

  async function submit(nickname: string, code?: string) {
    if (!ready || session || busy.current) return;
    if (!isNickname(nickname.trim())) { setError("Biệt danh cần 1–30 ký tự sau khi bỏ khoảng trắng hai đầu."); return; }
    if (code !== undefined && !isCode(code)) { setError("Mã phòng gồm 6 chữ in hoa/số theo mã được chia sẻ."); return; }
    busy.current = true; setLoading(true); setError("");
    const controller = new AbortController(); requestController.current = controller;
    try {
      const next = await requestRoom(nickname, code, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]));
      if (!alive.current || controller.signal.aborted) return;
      let saved = false;
      try { saved = saveRoomSession(window.sessionStorage, next); } catch { /* tiếp tục dùng trong bộ nhớ */ }
      setWarning(saved ? "" : "Không lưu được phiên. Nếu tải lại trang bạn có thể mất token của ghế này.");
      setIdentity(null); setSnapshot(null); setPhase("Đang kết nối");
      setOnline({ snapshot: null, synced: false, pending: null, message: "", recovery: false });
      setSelectionEpoch((value) => value + 1); setSession(next);
    } catch (err: unknown) {
      if (alive.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : "Không nhận được kết quả yêu cầu.");
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
      if (requestController.current === controller) requestController.current = null;
    }
  }
  function sendMove(pieceId: string, to: Piece["position"]): boolean {
    return gameSession.current?.sendMove(pieceId, to) ?? false;
  }
  const canPlay = !!identity && online.synced && !online.pending && !online.recovery && !!online.snapshot?.playEnabled &&
    online.snapshot.game?.result.status === "playing" && online.snapshot.game.sideToMove === identity.seat;
  return { session, identity, snapshot, ready, loading, phase, error, warning, submit, online, canPlay, selectionEpoch, sendMove };
}
