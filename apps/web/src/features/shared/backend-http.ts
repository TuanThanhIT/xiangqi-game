export class GatewayError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function backendFetch(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
}

export async function backendJson(response: Response): Promise<unknown> {
  if (!/^application\/json\b/i.test(response.headers.get("content-type") ?? "")) throw badGateway();
  try { return await response.json(); } catch (error) {
    if (error instanceof SyntaxError) throw badGateway();
    throw error;
  }
}
export const badGateway = () => new GatewayError(502, "BAD_GATEWAY", "Backend trả dữ liệu không đúng hợp đồng.");
export function gatewayFailure(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    return new GatewayError(504, "UPSTREAM_TIMEOUT", "Backend chưa trả lời kịp. Yêu cầu có thể đã thành công; không tự gửi lại.");
  }
  return new GatewayError(502, "UPSTREAM_UNAVAILABLE", "Không nhận được kết quả từ backend. Yêu cầu có thể đã thành công; không tự gửi lại.");
}
