import { getBackendHttpOrigin } from "../rooms/room-config";
import { readRequestId } from "../rooms/request-id";
import { backendFetch, backendJson, badGateway, gatewayFailure } from "../shared/backend-http";
import { isAuthResult, isProfile, isVerificationState } from "./auth-contract";

type Operation = "login" | "refresh" | "logout" | "me" | "register" | "verification/start" | "verification/status" | "verification/resend" | "verification/verify";
const errorStatuses: Record<string, number> = { INVALID_LOGIN_INPUT: 400, INVALID_JSON: 400, INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403, UNAUTHENTICATED: 401, SESSION_EXPIRED: 401, ORIGIN_NOT_ALLOWED: 403, INTERNAL_ERROR: 500,
  INVALID_REGISTRATION_INPUT: 400, INVALID_NICKNAME: 400, EMAIL_IN_USE: 409, NICKNAME_IN_USE: 409,
  REGISTRATION_EXPIRED: 410, INVALID_OTP_INPUT: 400, OTP_INVALID: 400, OTP_EXPIRED: 400, OTP_LOCKED: 400, OTP_ALREADY_USED: 409, OTP_SEND_LIMIT: 429 };

export async function proxyAuth(request: Request, operation: Operation): Promise<Response> {
  let id = readRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "x-request-id": id } });
  const fail = (status: number, code: string, message: string) => json({ statusCode: status, code, message }, status);
  const headers: Record<string, string> = { "x-request-id": id };
  if (operation !== "me") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return fail(403, "ORIGIN_NOT_ALLOWED", "Nguồn yêu cầu không được phép.");
    headers.Origin = origin;
  } else {
    const authorization = request.headers.get("authorization");
    if (authorization && /^Bearer [A-Za-z0-9_.-]{1,4096}$/.test(authorization)) headers.Authorization = authorization;
  }
  let body: string | undefined;
  if (["login", "register", "verification/start"].includes(operation)) {
    let input: unknown;
    try { input = await request.json(); } catch { return fail(400, "INVALID_JSON", "Dữ liệu JSON không hợp lệ."); }
    if (typeof input !== "object" || input === null || Array.isArray(input) || Object.keys(input).length !== (operation === "register" ? 3 : 2) ||
      !("email" in input) || !("password" in input) || typeof input.email !== "string" || typeof input.password !== "string" ||
      input.email.length > 300 || input.password.length > 1024 || (operation === "register" && (!("nickname" in input) || typeof input.nickname !== "string" || input.nickname.length > 300))) return fail(400, "INVALID_LOGIN_INPUT", "Kiểm tra địa chỉ email và mật khẩu đã nhập.");
    body = JSON.stringify({ email: input.email, password: input.password, ...(operation === "register" && "nickname" in input ? { nickname: input.nickname } : {}) });
    headers["Content-Type"] = "application/json";
  }
  if (["verification/status", "verification/resend", "verification/verify"].includes(operation)) {
    let input: unknown;
    try { input = await request.json(); } catch { return fail(400, "INVALID_JSON", "Dữ liệu JSON không hợp lệ."); }
    const verify = operation === "verification/verify";
    if (typeof input !== "object" || input === null || Array.isArray(input) || Object.keys(input).length !== (verify ? 2 : 1) ||
      !("accountId" in input) || typeof input.accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.accountId) ||
      (verify && (!("code" in input) || typeof input.code !== "string" || !/^\d{6}$/.test(input.code)))) return fail(400, "INVALID_OTP_INPUT", "Nhập mã xác minh gồm 6 chữ số.");
    body = JSON.stringify({ accountId: input.accountId, ...(verify && "code" in input ? { code: input.code } : {}) });
    headers["Content-Type"] = "application/json";
  }
  if (operation === "refresh" || operation === "logout") {
    const cookies = (request.headers.get("cookie") ?? "").split(";").map((v) => v.trim()).filter((v) => /^xq_refresh=[A-Za-z0-9_-]{43}$/.test(v));
    if (cookies.length === 1) headers.Cookie = cookies[0];
  }
  let base: string;
  try { base = getBackendHttpOrigin(); } catch { return fail(503, "CONFIG_ERROR", "Chưa cấu hình backend HTTP hợp lệ."); }
  try {
    const upstream = await backendFetch(base + (operation === "me" ? "/me" : `/auth/${operation}`), {
      method: operation === "me" ? "GET" : "POST", headers, body,
    });
    id = readRequestId(upstream.headers.get("x-request-id")) ?? id;
    const data = await backendJson(upstream);
    const validError = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" &&
      Object.hasOwn(errorStatuses, data.code) && errorStatuses[data.code] === upstream.status && "statusCode" in data && data.statusCode === upstream.status &&
      "message" in data && typeof data.message === "string" && Object.keys(data).length === 3;
    const validSuccess = upstream.status === 200 && (operation === "me" ? isProfile(data) : operation === "logout" || operation === "verification/verify"
      ? typeof data === "object" && data !== null && "ok" in data && data.ok === true && Object.keys(data).length === 1
      : operation === "register" || operation.startsWith("verification/") ? isVerificationState(data) : isAuthResult(data));
    if (!(upstream.ok ? validSuccess : validError)) throw badGateway();
    const response = json(data, upstream.status);
    // Headers.getSetCookie preserves each Set-Cookie separately (Expires contains commas).
    for (const cookie of upstream.headers.getSetCookie()) {
      if (cookie.startsWith("xq_refresh=")) response.headers.append("Set-Cookie", cookie);
    }
    return response;
  } catch (error) {
    const problem = gatewayFailure(error);
    return fail(problem.status, problem.code, problem.message);
  }
}
