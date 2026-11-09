import type { Side } from "@xiangqi/rules";

export const TOTAL_MINUTES = [5, 10, 15, 20, 30] as const;
export const TURN_MS = 60_000;
export function isTotalMinutes(value: unknown): value is number {
  return typeof value === "number" && TOTAL_MINUTES.some(minutes => minutes === value);
}

// remainingMs is the bank at turnStartedAt; reads never mutate or restart a clock.
export interface GameClock {
  totalMs: number;
  turnMs: number;
  remainingMs: Record<Side, number>;
  activeSide: Side;
  turnStartedAt: number;
  stoppedAt: number | null;
}
export interface PublicClock {
  totalMs: number;
  turnMs: number;
  remainingMs: Record<Side, number>;
  runningSide: Side | null;
  turnStartedAt: number;
  turnDeadlineAt: number;
  totalDeadlineAt: number;
  stoppedAt: number | null;
}
export function startGameClock(totalMs: number, now: number): GameClock {
  return {totalMs, turnMs: TURN_MS, remainingMs: {red: totalMs, black: totalMs},
    activeSide: "red", turnStartedAt: now, stoppedAt: null};
}
export function clockDeadline(clock: GameClock): {at: number; reason: "total_timeout" | "turn_timeout"} {
  const total = clock.turnStartedAt + clock.remainingMs[clock.activeSide];
  const turn = clock.turnStartedAt + clock.turnMs;
  return total <= turn ? {at: total, reason: "total_timeout"} : {at: turn, reason: "turn_timeout"};
}
export function publicClock(clock: GameClock, now: number): PublicClock {
  const remainingMs = {...clock.remainingMs};
  remainingMs[clock.activeSide] = Math.max(0, remainingMs[clock.activeSide] -
    Math.max(0, (clock.stoppedAt ?? now) - clock.turnStartedAt));
  return {totalMs: clock.totalMs, turnMs: clock.turnMs, remainingMs,
    runningSide: clock.stoppedAt === null ? clock.activeSide : null,
    turnStartedAt: clock.turnStartedAt, turnDeadlineAt: clock.turnStartedAt + clock.turnMs,
    totalDeadlineAt: clock.turnStartedAt + clock.remainingMs[clock.activeSide], stoppedAt: clock.stoppedAt};
}
export function nextClockTurn(clock: GameClock, side: Side, now: number): GameClock {
  return {...clock, remainingMs: publicClock(clock, now).remainingMs, activeSide: side, turnStartedAt: now};
}
