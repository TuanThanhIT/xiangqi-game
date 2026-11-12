import { createInitialPieces, getLegalMoves, isInCheck } from "@xiangqi/rules";
import type { BoardEffect, Piece, Side } from "@xiangqi/rules";
import type { RoomGame } from "../rooms/room-game";
import { publicClock, type GameClock } from "../rooms/game-clock";

export const itemCodes = ["scout", "time_saver", "unseal", "shield_breaker", "time_pressure", "time_extension", "calm", "shield", "seal", "revive"] as const;
export type ItemCode = typeof itemCodes[number];
export const targetedItems: readonly ItemCode[] = ["scout", "unseal", "shield_breaker", "shield", "seal", "revive"];
export interface ActiveEffect extends BoardEffect {
  itemCode: "shield" | "seal"; ownerAccountId: string; sourceSide: Side; acceptedAt: number;
  startTurnSequence: number; expiresAfterTurnSequence: number; status: "active";
}
export interface ScoutResult { targetPieceId: string; destinations: Piece["position"][]; stateVersion: number; stale: boolean }
export interface ItemState {
  turnSequence: number; effects: ActiveEffect[]; used: Record<Side, ItemCode[]>;
  usedTurn: number | null; saver: { side: Side; acceptedAt: number; turnSequence: number } | null;
  scouts: Partial<Record<Side, ScoutResult>>;
  history: Array<{ itemCode: ItemCode; side: Side; targetPieceId?: string; acceptedAt: number }>;
}
export function createItemState(): ItemState {
  return {turnSequence: 0, effects: [], used: {red: [], black: []}, usedTurn: null, saver: null, scouts: {}, history: []};
}
export class ItemRejected extends Error { constructor(readonly code: string) { super(code); } }
export function invalidateScouts(state: ItemState): void { for (const scout of Object.values(state.scouts)) if (scout) scout.stale = true; }
export interface ItemPlan { game: RoomGame; clock: GameClock; items: ItemState; scout?: ScoutResult }

/** Pure domain simulation. Never consumes inventory, changes a turn, or publishes private data. */
export function simulateItem(game: RoomGame, clock: GameClock, state: ItemState, side: Side,
  ownerAccountId: string, itemCode: ItemCode, targetPieceId: string | undefined, acceptedAt: number, resultingVersion: number): ItemPlan {
  const plan: ItemPlan = {game: structuredClone(game), clock: structuredClone(clock), items: structuredClone(state)};
  const {items} = plan, enemy = side === "red" ? "black" : "red";
  const target = game.pieces.find(p => p.id === targetPieceId);
  const reject = (code = "invalid_item_target"): never => { throw new ItemRejected(code); };
  const has = (code: string) => items.effects.some(e => e.effectCode === code && e.targetPieceId === targetPieceId);
  if (itemCode === "scout") {
    if (!target || target.side !== enemy) reject();
    plan.scout = {targetPieceId: target!.id, destinations: getLegalMoves(game.pieces, enemy, items.effects)
      .filter(m => m.pieceId === target!.id).map(m => m.to), stateVersion: resultingVersion, stale: false};
    items.scouts[side] = plan.scout;
  } else if (itemCode === "shield" || itemCode === "seal") {
    if (!target || target.type === "general" || target.side !== (itemCode === "shield" ? side : enemy)) reject();
    if (has(itemCode)) reject("item_no_effect");
    items.effects.push({effectCode: itemCode, itemCode, ownerAccountId, sourceSide: side, targetPieceId: target!.id,
      acceptedAt, startTurnSequence: items.turnSequence, expiresAfterTurnSequence: items.turnSequence + 1, status: "active"});
    invalidateScouts(items);
  } else if (itemCode === "unseal" || itemCode === "shield_breaker") {
    const effect = itemCode === "unseal" ? "seal" : "shield";
    if (!target || target.side !== (itemCode === "unseal" ? side : enemy)) reject();
    if (!has(effect)) reject("item_no_effect");
    items.effects = items.effects.filter(e => !(e.effectCode === effect && e.targetPieceId === targetPieceId));
    invalidateScouts(items);
  } else if (itemCode === "revive") {
    const original = createInitialPieces().find(p => p.id === targetPieceId);
    if (!original || original.side !== side || original.type === "general" || target ||
      !game.captured?.some(p => p.id === targetPieceId) || game.pieces.some(p => p.position.row === original.position.row && p.position.col === original.position.col)) reject();
    plan.game.pieces.push(structuredClone(original!));
    plan.game.captured = (plan.game.captured ?? []).filter(piece => piece.id !== targetPieceId);
    items.effects = items.effects.filter(e => e.targetPieceId !== targetPieceId);
    if (isInCheck(plan.game.pieces, side, items.effects)) reject("revive_in_check");
    invalidateScouts(items);
  } else if (itemCode === "time_saver") {
    items.saver = {side, acceptedAt, turnSequence: items.turnSequence};
  } else if (itemCode === "calm") {
    plan.clock.turnMs += 15_000;
  } else if (itemCode === "time_pressure") {
    const total = publicClock(clock, acceptedAt).remainingMs[enemy];
    if (total <= 10_000) reject("item_no_effect");
    plan.clock.remainingMs[enemy] -= Math.min(15_000, total - 10_000);
  } else if (itemCode === "time_extension") {
    const amount = Math.min(30_000, clock.totalMs - publicClock(clock, acceptedAt).remainingMs[side]);
    if (amount < 1) reject("item_no_effect");
    plan.clock.remainingMs[side] += amount;
  }
  if (!getLegalMoves(plan.game.pieces, side, items.effects).length) reject("item_no_legal_move");
  items.used[side].push(itemCode); items.usedTurn = items.turnSequence;
  items.history.push({itemCode, side, acceptedAt, ...(targetPieceId && itemCode !== "scout" ? {targetPieceId} : {})});
  plan.game.revision++;
  plan.game.result = {status: "playing", sideToMove: side, inCheck: isInCheck(plan.game.pieces, side, items.effects)};
  return plan;
}

/** Expire at end of completed turn, then evaluate the recipient's position. */
export function afterItemMove(state: ItemState, game: RoomGame): ItemState {
  const next = structuredClone(state);
  next.effects = next.effects.filter(e => e.expiresAfterTurnSequence > next.turnSequence && game.pieces.some(p => p.id === e.targetPieceId));
  next.turnSequence++; next.usedTurn = null; next.saver = null; invalidateScouts(next);
  return next;
}
export function refundTimeSaver(clock: GameClock, state: ItemState, side: Side, now: number): GameClock {
  const saver = state.saver;
  if (!saver || saver.side !== side || saver.turnSequence !== state.turnSequence || now - saver.acceptedAt > 10_000) return clock;
  const amount = Math.min(Math.max(0, now - saver.acceptedAt), clock.totalMs - publicClock(clock, now).remainingMs[side]);
  return {...clock, remainingMs: {...clock.remainingMs, [side]: clock.remainingMs[side] + amount}};
}
export function casualResult(game: RoomGame, clock: GameClock, state: ItemState, loadout: string[], now: number): RoomGame["result"] {
  const side = game.sideToMove, inCheck = isInCheck(game.pieces, side, state.effects);
  if (getLegalMoves(game.pieces, side, state.effects).length) return {status: "playing", sideToMove: side, inCheck};
  if (state.usedTurn !== state.turnSequence) for (const code of loadout) {
    if (!itemCodes.includes(code as ItemCode) || state.used[side].includes(code as ItemCode)) continue;
    // These cannot create a legal chess move; skip expensive, unproductive simulations.
    if (!["unseal", "shield_breaker", "shield", "seal", "revive"].includes(code)) continue;
    const targets = code === "revive" ? (game.captured ?? []) : game.pieces;
    for (const target of targets) {
      try { simulateItem(game, clock, state, side, "", code as ItemCode, target.id, now, 0);
        return {status: "playing", sideToMove: side, inCheck};
      } catch (error) { if (!(error instanceof ItemRejected)) throw error; }
    }
  }
  return {status: "finished", winner: side === "red" ? "black" : "red", loser: side, reason: inCheck ? "checkmate" : "stalemate"};
}

export interface ItemRequest { matchId: string; requestId: string; expectedVersion: number; itemCode: ItemCode; targetPieceId?: string }
export function parseItemRequest(value: unknown): ItemRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!itemCodes.includes(v.itemCode as ItemCode)) return null;
  const targeted = targetedItems.includes(v.itemCode as ItemCode);
  const keys = ["matchId", "requestId", "expectedVersion", "itemCode", ...(targeted ? ["targetPieceId"] : [])];
  if (Object.keys(v).length !== keys.length || !keys.every(k => Object.hasOwn(v, k))) return null;
  if (targeted && (typeof v.targetPieceId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v.targetPieceId))) return null;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(typeof v.matchId!=="string"||!uuid.test(v.matchId)||typeof v.requestId!=="string"||!uuid.test(v.requestId)||
    !Number.isSafeInteger(v.expectedVersion)||Number(v.expectedVersion)<0)return null;
  return {matchId:v.matchId.toLowerCase(),requestId:v.requestId.toLowerCase(),expectedVersion:Number(v.expectedVersion),
    itemCode:v.itemCode as ItemCode,...(targeted?{targetPieceId:v.targetPieceId as string}:{})};
}
