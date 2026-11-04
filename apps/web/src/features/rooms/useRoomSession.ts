"use client";

import { useEffect, useRef, useState } from "react";
import { requestRoom } from "./room-api";
import { createRoomSocket } from "./room-socket";
import { clearRoomSessionIfMatches, loadRoomSession, readRoomSession, saveRoomSession, sameCredentials } from "./room-storage";
import { isCode, isIdentity, isNickname, isReplaced, isSnapshot, isSocketError, record } from "./room-contract";
import type { RoomIdentity, RoomSession, RoomSnapshot } from "./room-contract";
import { OnlineGameSession } from "./online-game-session";
import type { OnlineState } from "./online-game-session";
import type { Piece } from "@xiangqi/rules";
import type { RoomThemeId } from "./room-theme";
import { isRoomThemeId } from "./room-theme";

export function useRoomSession() {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [savedSession, setSavedSession] = useState<RoomSession | null>(null);
  const starting = useRef(false);
  const replacingRoom = useRef(false);
  const [switchingRoom, setSwitchingRoom] = useState(false);
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
  const leaveFinished = useRef<(() => boolean) | null>(null);
  const [online, setOnline] = useState<OnlineState>({ snapshot: null, synced: false, pending: null, message: "", recovery: false });
  const [selectionEpoch, setSelectionEpoch] = useState(0);

  useEffect(() => {
    alive.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const stored = loadRoomSession(() => window.localStorage, () => window.sessionStorage);
      setSavedSession(stored.session); setWarning(stored.warning);
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
    let verifiedTheme: RoomThemeId | null = null;
    let latestOnline: OnlineState | null = null;
    const switching = replacingRoom.current;
    let resignStarted = false;
    let gameStateVersion = 0;
    let connectionGeneration = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let socket: ReturnType<typeof createRoomSocket>;
    try { socket = createRoomSocket(session); } catch {
      queueMicrotask(() => { if (active) { setError("Chưa cấu hình địa chỉ backend Socket.IO hợp lệ."); setPhase("Lỗi cấu hình"); } });
      return () => { active = false; };
    }
    const game = new OnlineGameSession(session.roomCode, session.seat, {
      connected: () => active && !terminal && verified && socket.connected,
      send: (request, callback, kind) => {
        // Volatile không buffer nước đi khi transport không sẵn sàng; controller quản lý retry.
        if (active && !terminal && verified && socket.connected) socket.volatile.emit(kind === "move" ? "game:move" : "game:resign", request, callback);
      },
      change: (state) => {
        if (!active || terminal) return;
        latestOnline = state;
        setOnline(state);
        const version = ++gameStateVersion;
        if (switching) queueMicrotask(() => {
          if (!active || terminal || version !== gameStateVersion || !verified || !socket.connected || !state.synced || state.recovery) return;
          if (!state.snapshot?.game || state.snapshot.game.result.status !== "playing") {
            leaveOldRoom();
          } else if (!resignStarted && !state.pending) {
            resignStarted = true;
            game.sendResign();
          } else if (resignStarted && !state.pending) {
            stop("Chưa xác nhận được trận cũ đã kết thúc. Phiên được giữ; hãy tải lại trang để phục hồi.", false);
          }
        });
      },
      schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
      uuid: () => crypto.randomUUID(),
      protocolError: () => stop("Dữ liệu trận không nhất quán. Hãy tải lại trang để đồng bộ.", false),
    });
    gameSession.current = game;
    const exitFinished = () => leaveOldRoom(true);
    leaveFinished.current = exitFinished;
    function leaveOldRoom(finishedOnly = false): boolean {
      if (!active || terminal) return false;
      if (finishedOnly) {
        // Chỉ snapshot đã qua validator mới cho phép rời trận mà không đầu hàng.
        if (!latestOnline?.snapshot?.game || latestOnline.recovery || latestOnline.snapshot.game.result.status === "playing") return false;
      } else if (!switching) return false;
      let cleared = false;
      try { cleared = clearRoomSessionIfMatches(window.localStorage, session!); } catch { /* báo bên dưới */ }
      try { cleared = clearRoomSessionIfMatches(window.sessionStorage, session!) && cleared; } catch { cleared = false; }
      if (!cleared) { stop("Chưa xóa được phiên lưu. Phiên được giữ để phục hồi; hãy kiểm tra quyền storage rồi tải lại.", false); return false; }
      terminal = true; verified = false;
      detachSocket();
      let latest: RoomSession | null = null;
      try { latest = readRoomSession(window.localStorage).session; } catch { /* không ghi đè phiên mới */ }
      setSavedSession(latest && !sameCredentials(latest, session!) ? latest : null);
      setSession(null); setIdentity(null); setSnapshot(null);
      setOnline({ snapshot: null, synced: false, pending: null, message: "", recovery: false });
      setError(""); setPhase("Chưa kết nối");
      if (latest && !sameCredentials(latest, session!)) setWarning("Một tab khác đã lưu phiên mới; phiên đó được giữ nguyên.");
      replacingRoom.current = false; starting.current = false; setSwitchingRoom(false);
      return true;
    }
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
        try {
          cleared = clearRoomSessionIfMatches(window.localStorage, session!);
        } catch { /* thông báo an toàn bên dưới */ }
        // Thử dọn legacy riêng, kể cả khi localStorage bị chặn.
        try { cleared = clearRoomSessionIfMatches(window.sessionStorage, session!) && cleared; } catch { cleared = false; }
        if (!cleared) setWarning("Không thể xóa phiên lưu. Hãy xóa dữ liệu trang hoặc đóng tab trước khi tải lại để tránh chiếm lại ghế.");
        setSession(null); setSnapshot(null);
        // Không migrate lại legacy bị từ chối nếu việc xóa legacy thất bại.
        let latest: RoomSession | null = null;
        try { latest = readRoomSession(window.localStorage).session; } catch { /* giữ cảnh báo trên */ }
        setSavedSession(latest && !sameCredentials(latest, session!) ? latest : null);
        starting.current = false;
        replacingRoom.current = false; setSwitchingRoom(false);
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
        stop("Server trả thông tin ghế không khớp phiên đã lưu.", false); return;
      }
      clearTimeout(deadline); verified = true; setIdentity(data); setPhase("Đã kết nối và xác thực"); setError("");
      game.authenticatedNow();
    }
    function onState(data: unknown) {
      if (!active || terminal || !verified) return;
      if (!isSnapshot(data) || data.roomCode !== session!.roomCode || data.players[session!.seat]?.nickname !== session!.nickname) {
        stop("Dữ liệu trạng thái phòng không đúng hợp đồng.", false); return;
      }
      if (verifiedTheme !== null && verifiedTheme !== data.themeId) {
        stop("Phong cách phòng thay đổi ngoài hợp đồng. Hãy tải lại trang để đồng bộ.", false); return;
      }
      verifiedTheme = data.themeId;
      setSnapshot(data);
    }
    function onReplaced(data: unknown) {
      if (!isReplaced(data)) { stop("Thông báo thay thế ghế không đúng hợp đồng.", false); return; }
      stop("Ghế này đã được kết nối ở tab hoặc cửa sổ khác. Tab này đã dừng kết nối; phiên lưu vẫn được giữ.", false);
    }
    function onConnectError(err: unknown) {
      if (!active || terminal) return;
      const data: unknown = record(err) ? err.data : undefined;
      if (data !== undefined) {
        if (!isSocketError(data)) { stop("Lỗi xác thực không đúng hợp đồng.", false); return; }
        stop(data.code === "AUTH_FAILED" ? "Phiên phòng không còn hợp lệ hoặc server đã khởi động lại."
          : data.code === "INVALID_HANDSHAKE" ? "Thông tin phiên phòng không hợp lệ." : "Backend chưa thể xác thực kết nối.",
          data.code === "AUTH_FAILED");
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
    function detachSocket() {
      active = false; clearTimeout(deadline);
      if (leaveFinished.current === exitFinished) leaveFinished.current = null;
      game.dispose(); if (gameSession.current === game) gameSession.current = null;
      socket.off("game:state", onGameState);
      socket.off("connect", onConnect); socket.off("room:session", onSession); socket.off("room:state", onState);
      socket.off("room:replaced", onReplaced); socket.off("connect_error", onConnectError); socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onAttempt); socket.io.off("reconnect_failed", onFailed);
      socket.io.reconnection(false); socket.auth = {}; socket.disconnect();
    }
    return detachSocket;
  }, [session]);

  async function submit(nickname: string, code?: string, themeId: RoomThemeId = "earth") {
    if (!ready || session || savedSession || busy.current || switchingRoom) return;
    const stored = loadRoomSession(() => window.localStorage, () => window.sessionStorage);
    if (stored.session) { setSavedSession(stored.session); setWarning(stored.warning); return; }
    if (!isNickname(nickname.trim())) { setError("Biệt danh cần 1–30 ký tự sau khi bỏ khoảng trắng hai đầu."); return; }
    if (code !== undefined && !isCode(code)) { setError("Mã phòng gồm 6 chữ in hoa/số theo mã được chia sẻ."); return; }
    if (code === undefined && !isRoomThemeId(themeId)) { setError("Phong cách phòng không hợp lệ."); return; }
    busy.current = true; setLoading(true); setError("");
    const controller = new AbortController(); requestController.current = controller;
    try {
      const next = await requestRoom(nickname, code, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), themeId);
      if (!alive.current || controller.signal.aborted) return;
      let saved = false;
      try { saved = saveRoomSession(window.localStorage, next); } catch { /* tiếp tục dùng trong bộ nhớ */ }
      setWarning(saved ? "" : "Không lưu được phiên hoặc đã có phiên khác. Sau khi đóng tab có thể không khôi phục được ghế này.");
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
  function startSavedRoom(replace: boolean) {
    if (!ready || session || !savedSession || starting.current || online.pending) return;
    const stored = loadRoomSession(() => window.localStorage, () => window.sessionStorage);
    if (stored.session && !sameCredentials(stored.session, savedSession)) {
      setSavedSession(stored.session); setWarning("Phiên lưu đã thay đổi. Hãy kiểm tra thông tin rồi bấm tiếp tục lại."); return;
    }
    starting.current = true;
    replacingRoom.current = replace; setSwitchingRoom(replace);
    setError(""); setSession(stored.session ?? savedSession);
    if (stored.warning) setWarning(stored.warning);
  }
  function continueRoom() { startSavedRoom(false); }
  function newRoom() {
    if (!ready || session || !savedSession || starting.current || online.pending) return;
    if (window.confirm("Nếu ván cũ còn diễn ra, bạn sẽ đầu hàng để tạo phòng mới.")) startSavedRoom(true);
  }
  function sendMove(pieceId: string, to: Piece["position"]): boolean {
    return replacingRoom.current ? false : gameSession.current?.sendMove(pieceId, to) ?? false;
  }
  function sendResign(): boolean { return replacingRoom.current ? false : gameSession.current?.sendResign() ?? false; }
  function exitFinishedRoom(): boolean { return leaveFinished.current?.() ?? false; }
  const canResign = !switchingRoom && !!identity && online.synced && !online.pending && !online.recovery && online.snapshot?.game?.result.status === "playing";
  const canPlay = !switchingRoom && !!identity && online.synced && !online.pending && !online.recovery && !!online.snapshot?.playEnabled &&
    online.snapshot.game?.result.status === "playing" && online.snapshot.game.sideToMove === identity.seat;
  const canLeaveFinished = !switchingRoom && !online.recovery && !!online.snapshot?.game && online.snapshot.game.result.status !== "playing";
  return { session, savedSession, continueRoom, newRoom, exitFinishedRoom, canLeaveFinished, switchingRoom, identity, snapshot, ready, loading, phase, error, warning, submit, online, canPlay, canResign, selectionEpoch, sendMove, sendResign };
}
