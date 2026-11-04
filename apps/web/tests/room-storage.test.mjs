import test from "node:test";
import assert from "node:assert/strict";
import { loader } from "./load-source.mjs";
const { loadRoomSession, readRoomSession, saveRoomSession, clearRoomSessionIfMatches } = loader()("apps/web/src/features/rooms/room-storage.ts");
const KEY = "xiangqi.room.v1";
const a = { roomCode: "ABC234", seatToken: "A".repeat(43), seat: "red", nickname: "A" };
const b = { roomCode: "DEF234", seatToken: "B".repeat(43), seat: "black", nickname: "B" };
function storage(session = null, failures = {}) {
  const data = new Map(session ? [[KEY, JSON.stringify({ version: 1, ...session })]] : []);
  return { data, getItem(key) { if (failures.read) throw Error("blocked"); return data.get(key) ?? null; },
    setItem(key, value) { if (failures.write) throw Error("blocked"); data.set(key, value); },
    removeItem(key) { if (failures.remove) throw Error("blocked"); data.delete(key); } };
}
test("Storage: migrate chỉ xóa legacy sau ghi thành công; dữ liệu tiếp tục tồn tại qua tab mới", () => {
  const local = storage(), legacy = storage(a);
  assert.deepEqual(loadRoomSession(() => local, () => legacy).session, a);
  assert.equal(legacy.getItem(KEY), null); assert.deepEqual(readRoomSession(local).session, a);
  assert.deepEqual(loadRoomSession(() => local, () => storage()).session, a);
  const blocked = storage(null, { write: true }), old = storage(a);
  const failed = loadRoomSession(() => blocked, () => old);
  assert.deepEqual(failed.session, a); assert.ok(failed.warning); assert.ok(old.getItem(KEY));
});
test("Storage: local hợp lệ ưu tiên; không ghi đè phiên khác; chỉ xóa credentials khớp", () => {
  const local = storage(b), legacy = storage(a);
  assert.deepEqual(loadRoomSession(() => local, () => legacy).session, b);
  assert.ok(legacy.getItem(KEY)); assert.equal(saveRoomSession(local, a), false);
  assert.equal(clearRoomSessionIfMatches(local, a), true); assert.deepEqual(readRoomSession(local).session, b);
  assert.equal(clearRoomSessionIfMatches(local, b), true); assert.equal(local.getItem(KEY), null);
});
test("Storage: JSON/kiểu sai và lỗi đọc/ghi/xóa/getter không làm crash hoặc lộ credentials", () => {
  const bad = storage(); bad.data.set(KEY, '{broken'); assert.equal(readRoomSession(bad).session, null);
  bad.data.set(KEY, JSON.stringify({ version: 1, ...a, extra: true })); assert.equal(readRoomSession(bad).session, null);
  const denied = () => { throw Error("blocked"); };
  assert.ok(loadRoomSession(denied, denied).warning);
  const old = storage(a), unreadable = storage(b, { read: true });
  const fallback = loadRoomSession(() => unreadable, () => old);
  assert.deepEqual(fallback.session, a); assert.ok(fallback.warning); assert.ok(old.getItem(KEY));
  const noRemove = storage(a, { remove: true }); assert.equal(clearRoomSessionIfMatches(noRemove, a), true);
  assert.equal(readRoomSession(noRemove).session, null);
  assert.equal(clearRoomSessionIfMatches(storage(a, { remove: true, write: true }), a), false);
});
