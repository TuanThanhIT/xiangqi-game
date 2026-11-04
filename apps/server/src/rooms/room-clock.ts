export const ROOM_CLOCK = Symbol("ROOM_CLOCK");
export interface RoomClock { now(): number; schedule(callback: () => void, delay: number): () => void }
export const systemRoomClock: RoomClock = {
  now: () => Date.now(),
  schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay); timer.unref();
    return () => clearTimeout(timer);
  },
};
