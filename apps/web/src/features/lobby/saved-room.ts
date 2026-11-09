import { readRoomSession } from "../rooms/room-storage";
import type { StoragePort } from "../rooms/room-storage";

// Only inspect V1 storage. Migration, cleanup and seat authentication belong to /play.
export function hasSavedRoom(local: () => StoragePort, legacy: () => StoragePort): boolean {
  try { if (readRoomSession(local()).session) return true; } catch { /* storage can be unavailable */ }
  try { return !!readRoomSession(legacy()).session; } catch { return false; }
}
