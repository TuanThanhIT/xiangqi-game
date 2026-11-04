import { errorMessages, isBackendError, isCode, isNickname, isSession, keys, record } from "./room-contract";
import { getBackendHttpOrigin } from "./room-config";
import { isRoomThemeId } from "./room-theme";

function json(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const failure = (status: number, code: string, message: string) => json({ statusCode: status, code, message }, status);

export async function proxyRoomRequest(request: Request, code?: string): Promise<Response> {
  if (code !== undefined && !isCode(code)) return failure(400, "INVALID_ROOM_CODE", errorMessages.INVALID_ROOM_CODE);
  let body: unknown;
  try { body = await request.json(); } catch { return failure(400, "INVALID_JSON", errorMessages.INVALID_JSON); }
  const create = code === undefined;
  if (!record(body) || !keys(body, ["nickname", ...(create && Object.hasOwn(body, "themeId") ? ["themeId"] : [])]) ||
      typeof body.nickname !== "string" || !isNickname(body.nickname.trim()) ||
      (Object.hasOwn(body, "themeId") && !isRoomThemeId(body.themeId))) {
    return failure(400, "INVALID_REQUEST", errorMessages.INVALID_REQUEST);
  }
  const nickname = body.nickname.trim();
  const themeId = create ? (body.themeId ?? "earth") : undefined;
  let base: string;
  try { base = getBackendHttpOrigin(); } catch { return failure(503, "CONFIG_ERROR", "Chưa cấu hình backend HTTP hợp lệ."); }
  try {
    const upstream = await fetch(base + (code === undefined ? "/rooms" : `/rooms/${code}/join`), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname, ...(create ? { themeId } : {}) }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!/^application\/json\b/i.test(upstream.headers.get("content-type") ?? "")) {
      return failure(502, "BAD_GATEWAY", "Backend trả dữ liệu không đúng hợp đồng.");
    }
    let data: unknown;
    try { data = await upstream.json(); } catch (error: unknown) {
      if (error instanceof SyntaxError) return failure(502, "BAD_GATEWAY", "Backend trả dữ liệu không đúng hợp đồng.");
      throw error;
    }
    const expectedStatus = code === undefined ? 201 : 200;
    if (upstream.status === expectedStatus && isSession(data) && data.seat === (code === undefined ? "red" : "black") &&
        data.nickname === nickname && (code === undefined || data.roomCode === code)) {
      return json({ roomCode: data.roomCode, seat: data.seat, nickname: data.nickname, seatToken: data.seatToken }, expectedStatus);
    }
    if (!upstream.ok && isBackendError(data, upstream.status)) {
      return failure(upstream.status, data.code, errorMessages[data.code]);
    }
    return failure(502, "BAD_GATEWAY", "Backend trả dữ liệu không đúng hợp đồng.");
  } catch (error: unknown) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      return failure(504, "UPSTREAM_TIMEOUT", "Backend chưa trả lời kịp. Yêu cầu có thể đã thành công; không tự gửi lại.");
    }
    return failure(502, "UPSTREAM_UNAVAILABLE", "Không nhận được kết quả từ backend. Yêu cầu có thể đã thành công; không tự gửi lại.");
  }
}
