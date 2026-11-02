import { isStoredSession } from "./room-contract";
import type { RoomSession, StoredSession } from "./room-contract";

const KEY = "xiangqi.room.v1";
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function clearRoomSession(storage: StoragePort): boolean {
  try { storage.removeItem(KEY); return true; } catch {
    // Tombstone không chứa credentials nếu browser cho ghi nhưng không cho xóa.
    try { storage.setItem(KEY, JSON.stringify({ revoked: true })); return true; } catch { return false; }
  }
}
export function readRoomSession(storage: StoragePort): { session: RoomSession | null; warning: string } {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return { session: null, warning: "" };
    const data: unknown = JSON.parse(raw);
    if (isStoredSession(data)) {
      return { session: { roomCode: data.roomCode, seatToken: data.seatToken, seat: data.seat, nickname: data.nickname }, warning: "" };
    }
    const cleared = clearRoomSession(storage);
    return { session: null, warning: cleared ? "Phiên đã lưu không còn hợp lệ." : "Không thể xóa phiên cũ; hãy xóa dữ liệu trang trước khi tải lại." };
  } catch {
    clearRoomSession(storage);
    return { session: null, warning: "Không đọc được phiên đã lưu. Phiên mới có thể không được giữ khi tải lại." };
  }
}
export function saveRoomSession(storage: StoragePort, session: RoomSession): boolean {
  try {
    const data: StoredSession = { version: 1, ...session };
    storage.setItem(KEY, JSON.stringify(data)); return true;
  } catch { return false; }
}
