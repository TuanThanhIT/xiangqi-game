import { errorMessages, isBackendError, isCode, isNickname, isSession, keys, record } from "./room-contract";
import { getBackendHttpOrigin } from "./room-config";
import { isRoomThemeId } from "./room-theme";
import { readRequestId } from "./request-id";
import { backendFetch, backendJson, gatewayFailure } from "../shared/backend-http";

function jsonResponse(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function proxyRoomRequest(request: Request, code?: string): Promise<Response> {
  let requestId = readRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const json = (body: object, status: number): Response => {
    const response = jsonResponse(body, status);
    response.headers.set("x-request-id", requestId);
    return response;
  };
  const failure = (status: number, code: string, message: string) => json({ statusCode: status, code, message }, status);
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
    const upstream = await backendFetch(base + (code === undefined ? "/rooms" : `/rooms/${code}/join`), {
      method: "POST", headers: { "Content-Type": "application/json", "x-request-id": requestId }, body: JSON.stringify({ nickname, ...(create ? { themeId } : {}) }),
    });
    requestId = readRequestId(upstream.headers.get("x-request-id")) ?? requestId;
    const data = await backendJson(upstream);
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
    const problem = gatewayFailure(error);
    return failure(problem.status, problem.code, problem.message);
  }
}
