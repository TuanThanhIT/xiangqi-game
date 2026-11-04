export interface ResignRequest { requestId: string }
export const resignErrors = {
  INVALID_RESIGN_REQUEST: "Yêu cầu đầu hàng sai định dạng.",
  SOCKET_NOT_ACTIVE: "Socket không còn giữ ghế hoặc chưa sẵn sàng.",
  GAME_NOT_STARTED: "Trận chưa bắt đầu.",
  GAME_FINISHED: "Trận đã kết thúc.",
  REQUEST_ID_CONFLICT: "Request ID đã được dùng cho yêu cầu khác.",
  INTERNAL_ERROR: "Không thể xử lý đầu hàng.",
};
export type ResignAck = { ok: true; requestId: string; appliedRevision: number } |
  { ok: false; requestId: string | null; code: keyof typeof resignErrors; message: string; currentRevision?: number };

export function parseResignRequest(value: unknown): ResignRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !Object.hasOwn(value, "requestId") || !("requestId" in value) ||
      typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) return null;
  return { requestId: value.requestId.toLowerCase() };
}
export function resignFailure(code: keyof typeof resignErrors, requestId: string | null, currentRevision?: number): ResignAck {
  return { ok: false, requestId, code, message: resignErrors[code], ...(currentRevision === undefined ? {} : { currentRevision }) };
}
