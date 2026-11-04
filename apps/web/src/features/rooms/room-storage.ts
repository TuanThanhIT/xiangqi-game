import { isStoredSession } from "./room-contract";
import type { RoomSession, StoredSession } from "./room-contract";

const KEY = "xiangqi.room.v1";
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const sameCredentials = (a: RoomSession, b: RoomSession): boolean => a.roomCode === b.roomCode && a.seatToken === b.seatToken;
function decode(raw: string | null): RoomSession | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return isStoredSession(data) ? { roomCode: data.roomCode, seatToken: data.seatToken, seat: data.seat, nickname: data.nickname } : null;
  } catch { return null; }
}
export function clearRoomSessionIfMatches(storage: StoragePort, expected: RoomSession): boolean {
  try {
    const current = decode(storage.getItem(KEY));
    if (!current || !sameCredentials(current, expected)) return true;
    try { storage.removeItem(KEY); return true; } catch {
      const latest = decode(storage.getItem(KEY));
      if (!latest || !sameCredentials(latest, expected)) return true;
      storage.setItem(KEY, JSON.stringify({ revoked: true })); return true;
    }
  } catch { return false; }
}
export function readRoomSession(storage: StoragePort): { session: RoomSession | null; warning: string } {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return { session: null, warning: "" };
    const session = decode(raw);
    return { session, warning: session ? "" : "Phiên đã lưu không hợp lệ." };
  } catch {
    return { session: null, warning: "Không đọc được storage; không bảo đảm khôi phục phiên sau khi đóng tab." };
  }
}
export function saveRoomSession(storage: StoragePort, session: RoomSession): boolean {
  try {
    const existing = decode(storage.getItem(KEY));
    if (existing && !sameCredentials(existing, session)) return false;
    const data: StoredSession = { version: 1, ...session };
    storage.setItem(KEY, JSON.stringify(data)); return true;
  } catch { return false; }
}

// Getter để lỗi truy cập window.localStorage/sessionStorage cũng được xử lý.
export function loadRoomSession(local: () => StoragePort, legacy: () => StoragePort): { session: RoomSession | null; warning: string } {
  let localStore: StoragePort | undefined;
  let warning = "";
  try {
    localStore = local();
    const stored = readRoomSession(localStore);
    if (stored.session) return stored; // Không ghi đè local hợp lệ bằng phiên cũ.
    warning = stored.warning;
    // Kiểm tra quyền đọc thực sự; không migrate ghi đè khi không đọc được local.
    localStore.getItem(KEY);
  } catch { localStore = undefined; warning = "Không truy cập được localStorage; không bảo đảm khôi phục sau khi đóng tab."; }
  try {
    const oldStore = legacy();
    const old = readRoomSession(oldStore);
    if (!old.session) return { session: null, warning: warning || old.warning };
    if (localStore && saveRoomSession(localStore, old.session)) {
      const removed = clearRoomSessionIfMatches(oldStore, old.session);
      return { session: old.session, warning: removed ? "" : "Đã chuyển phiên nhưng chưa xóa được bản sessionStorage cũ." };
    }
    // Nếu một tab khác vừa ghi phiên hợp lệ, ưu tiên phiên đó.
    const latest = localStore ? readRoomSession(localStore) : null;
    if (latest?.session) return latest;
    return { session: old.session, warning: "Chưa lưu bền được phiên cũ; chỉ có thể khôi phục khi tab này còn giữ sessionStorage." };
  } catch { return { session: null, warning: warning || "Không truy cập được storage; không bảo đảm khôi phục sau khi đóng tab." }; }
}
