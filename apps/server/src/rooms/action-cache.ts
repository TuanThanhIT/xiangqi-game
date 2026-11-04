import type { MoveAck, MoveRequest } from "./move-request";
import type { ResignAck, ResignRequest } from "./resign-request";

export type CachedAction =
  | { kind: "move"; request: MoveRequest; ack: MoveAck }
  | { kind: "resign"; request: ResignRequest; ack: ResignAck };

// Chuẩn bị cache mới trước khi commit; không sửa cache/ack/payload đang giữ.
export function rememberAction(cache: ReadonlyMap<string, CachedAction>, action: CachedAction): Map<string, CachedAction> {
  if (cache.has(action.request.requestId)) throw new Error("Request ID đã tồn tại trong cache");
  const next = new Map(cache);
  next.set(action.request.requestId, structuredClone(action));
  if (next.size > 256) next.delete(next.keys().next().value!);
  return next;
}
