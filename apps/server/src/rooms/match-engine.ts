import type { Piece, Side } from "@xiangqi/rules";
import type { OnlineGameResult } from "./room-game";
import type { PublicClock } from "./game-clock";
import { createItemState, type ItemState, type ScoutResult } from "../items/item-effects";
import type { RoomReward } from "./rooms.types";
import { createMatchChatState, type MatchChatState } from "./match-chat";

export type MatchAction = "move" | "resign" | "draw_offer" | "draw_accept" | "draw_reject";
export interface MatchRequest {
  matchId: string;
  requestId: string;
  expectedVersion: number;
  from?: Piece["position"];
  to?: Piece["position"];
  offerId?: string;
}
export type MatchAck = { ok: true; requestId: string; stateVersion: number; scout?: ScoutResult } |
  { ok: false; requestId: string | null; code: string; currentVersion?: number };
export interface DrawOffer {
  id: string;
  side: Side;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "closed";
}
export interface MatchSession {
  chat: MatchChatState;
  items: ItemState;
  id: string;
  startedAt: number;
  drawRevision: number;
  offer: DrawOffer | null;
  counts: Record<Side, number>;
  lastOfferAt: Record<Side, number | null>;
  loadouts: Record<Side, string[]>;
  requests: Map<string, { fingerprint: string; ack: MatchAck }>;
}
export interface MatchSnapshot {
  turnSequence: number;
  activeEffects: Array<Omit<ItemState["effects"][number], "ownerAccountId">>;
  usedItems: ItemState["history"];
  ownUsedItems: string[];
  ownScout: ScoutResult | null;
  ownPendingItem: {requestId: string; status: "pending"} | null;
  matchId: string;
  roomCode: string;
  viewerSide: Side;
  players: Record<Side, { nickname: string }>;
  board: Piece[];
  sideToMove: Side;
  moveNumber: number;
  stateVersion: number;
  captured: Piece[];
  startedAt: number;
  serverNow: number;
  clock: PublicClock;
  inCheck: boolean;
  status: "active" | "result_pending" | "finished" | "cancelled";
  result: OnlineGameResult | null;
  reason: string | null;
  reward: RoomReward | null;
  drawOffer: DrawOffer | null;
  drawCounts: Record<Side, number>;
  ownDrawAvailableAt: number | null;
  ownLoadout: string[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function position(v: unknown): v is Piece["position"] {
  return object(v) && Object.keys(v).length === 2 && Number.isInteger(v.row) && Number.isInteger(v.col) &&
    Number(v.row) >= 0 && Number(v.row) <= 9 && Number(v.col) >= 0 && Number(v.col) <= 8;
}
export function parseMatchRequest(value: unknown, action: MatchAction): MatchRequest | null {
  if (!object(value)) return null;
  const extra = action === "move" ? ["from", "to"] : action === "draw_accept" || action === "draw_reject" ? ["offerId"] : [];
  const keys = ["matchId", "requestId", "expectedVersion", ...extra];
  if (Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)) ||
      typeof value.matchId !== "string" || !uuid.test(value.matchId) ||
      typeof value.requestId !== "string" || !uuid.test(value.requestId) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0) return null;
  const request: MatchRequest = {matchId: value.matchId.toLowerCase(), requestId: value.requestId.toLowerCase(), expectedVersion: Number(value.expectedVersion)};
  if (action === "move") {
    if (!position(value.from) || !position(value.to)) return null;
    request.from = {row: value.from.row, col: value.from.col}; request.to = {row: value.to.row, col: value.to.col};
  }
  if (extra.includes("offerId")) {
    if (typeof value.offerId !== "string" || !uuid.test(value.offerId)) return null;
    request.offerId = value.offerId.toLowerCase();
  }
  return request;
}
export function createMatchSession(id: string, startedAt: number, loadouts: Record<Side, string[]>): MatchSession {
  return { id, startedAt, chat:createMatchChatState(), items: createItemState(), loadouts: structuredClone(loadouts), drawRevision: 0, offer: null,
    counts: {red: 0, black: 0}, lastOfferAt: {red: null, black: null}, requests: new Map() };
}
export function expireDraw(session: MatchSession, now: number): boolean {
  if (session.offer?.status !== "pending" || now < session.offer.expiresAt) return false;
  session.offer.status = "expired"; session.drawRevision++; return true;
}
export function closeDraw(session: MatchSession): void {
  if (session.offer?.status === "pending") { session.offer.status = "closed"; session.drawRevision++; }
}
export function offerDraw(session: MatchSession, side: Side, requestId: string, now: number): string | null {
  if (session.offer?.status === "pending") return "draw_offer_already_pending";
  if (session.counts[side] >= 3) return "draw_offer_limit_reached";
  const last = session.lastOfferAt[side];
  if (last !== null && now - last < 60_000) return "draw_offer_cooldown";
  session.offer = {id: requestId, side, createdAt: now, expiresAt: now + 15_000, status: "pending"};
  session.counts[side]++; session.lastOfferAt[side] = now; session.drawRevision++; return null;
}
export function respondDraw(session: MatchSession, side: Side, offerId: string, accept: boolean): string | null {
  const offer = session.offer;
  if (!offer || offer.id !== offerId) return "draw_offer_not_found";
  if (offer.side === side) return "draw_offer_forbidden";
  if (offer.status === "expired") return "draw_offer_expired";
  if (offer.status !== "pending") return "draw_offer_not_found";
  offer.status = accept ? "accepted" : "rejected"; session.drawRevision++; return null;
}
