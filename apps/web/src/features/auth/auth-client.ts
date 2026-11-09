import { authMessages, isAuthResult, isProfile, isVerificationState } from "./auth-contract";
import type { AuthResult, Profile } from "./auth-contract";
import type { VerificationState } from "./auth-contract";
import { readRequestId } from "../rooms/request-id";

export class AuthRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId: string | null) {
    super(message); this.name = "AuthRequestError";
  }
}
// Access credentials live only in this page's JavaScript memory.
let access: Pick<AuthResult, "accessToken" | "expiresAt"> | null = null;
let flight: Promise<void> | null = null;
let generation = 0;
export function forgetAuth(): void { generation++; access = null; flight = null; }
export const accessExpiresAt = () => access ? Date.parse(access.expiresAt) : 0;
export async function authAccessToken(): Promise<string> {
  if (!access || accessExpiresAt() <= Date.now()+5000) await refreshAuth();
  return access?.accessToken ?? "";
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try { response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000) }); }
  catch { throw new AuthRequestError("Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0, "NETWORK_ERROR", null); }
  const id = readRequestId(response.headers.get("x-request-id"));
  let data: unknown;
  try { data = await response.json(); } catch { throw new AuthRequestError("Không đọc được phản hồi máy chủ. Vui lòng thử lại.", response.status, "BAD_RESPONSE", id); }
  if (!response.ok) {
    const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : "UNKNOWN_ERROR";
    throw new AuthRequestError(Object.hasOwn(authMessages, code) ? authMessages[code] : "Máy chủ chưa trả lời được. Vui lòng thử lại.", response.status, code, id);
  }
  return data;
}
export async function login(email: string, password: string): Promise<void> {
  const epoch = ++generation;
  const result = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!isAuthResult(result)) throw new AuthRequestError("Phản hồi đăng nhập không hợp lệ.", 502, "BAD_RESPONSE", null);
  if (epoch === generation) access = { accessToken: result.accessToken, expiresAt: result.expiresAt };
}
export async function refreshAuth(): Promise<void> {
  if (flight) return flight;
  const epoch = generation;
  const current = (async () => {
    const result = await request("/api/auth/refresh", { method: "POST" });
    if (!isAuthResult(result)) throw new AuthRequestError("Phản hồi phiên không hợp lệ.", 502, "BAD_RESPONSE", null);
    if (epoch === generation) access = { accessToken: result.accessToken, expiresAt: result.expiresAt };
  })();
  flight = current;
  try { await current; } catch (error) {
    if (epoch === generation && error instanceof AuthRequestError && error.status === 401) access = null;
    throw error;
  } finally { if (flight === current) flight = null; }
}
export async function loadProfile(): Promise<Profile> {
  if (!access || accessExpiresAt() <= Date.now() + 5000) await refreshAuth();
  const read = () => request("/api/me", { headers: { Authorization: `Bearer ${access?.accessToken ?? ""}` } });
  let result: unknown;
  try { result = await read(); } catch (error) {
    if (!(error instanceof AuthRequestError) || error.status !== 401) throw error;
    await refreshAuth(); result = await read();
  }
  if (!isProfile(result)) throw new AuthRequestError("Phản hồi hồ sơ không hợp lệ.", 502, "BAD_RESPONSE", null);
  return result;
}
export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
  forgetAuth();
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("xiangqi.auth"); channel.postMessage("logout"); channel.close();
  }
}

export async function registrationRequest(operation: "register" | "verification/start" | "verification/status" | "verification/resend", body: object): Promise<VerificationState> {
  const result = await request(`/api/auth/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!isVerificationState(result)) throw new AuthRequestError("Phản hồi xác minh không hợp lệ.", 502, "BAD_RESPONSE", null);
  return result;
}
export async function verifyEmail(accountId: string, code: string): Promise<void> {
  const result = await request("/api/auth/verification/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, code }) });
  if (typeof result !== "object" || result === null || !("ok" in result) || result.ok !== true) throw new AuthRequestError("Phản hồi xác minh không hợp lệ.", 502, "BAD_RESPONSE", null);
}
