import { errorMessages, isBackendError, isSession, record } from "./room-contract";
import type { RoomSession } from "./room-contract";
import type { RoomThemeId } from "./room-theme";
import { readRequestId } from "./request-id";
import { casualRequest } from "./casual-client";

export class RoomRequestError extends Error {
  constructor(message: string, readonly requestId: string | null, readonly status: number) {
    super(message);
    this.name = "RoomRequestError";
  }
}

export async function requestRoom(nickname: string, code: string | undefined, signal: AbortSignal, themeId: RoomThemeId = "earth", casual = false): Promise<RoomSession> {
  if (casual) {
    const result = await casualRequest(code === undefined ? "" : `/${code}/join`,code === undefined ? {themeId} : {},signal);
    if (!isSession(result) || !result.casual) throw new Error("Phản hồi phòng không hợp lệ.");
    return result;
  }
  let response: Response;
  try {
    response = await fetch(code === undefined ? "/api/rooms" : `/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname, ...(code === undefined ? { themeId } : {}) }),
      cache: "no-store", signal,
    });
  } catch {
    throw new Error("Chưa xác định yêu cầu đã thành công hay chưa. Không tự gửi lại POST; tạo/vào lại có thể giữ thêm ghế hoặc gặp phòng đầy.");
  }
  const failure = (message: string) => new RoomRequestError(message, readRequestId(response.headers.get("x-request-id")), response.status);
  let data: unknown;
  try { data = await response.json(); } catch { throw failure("Không đọc được kết quả. Yêu cầu có thể đã thành công; không tự gửi lại."); }
  if (response.status === (code === undefined ? 201 : 200) && isSession(data) &&
      data.seat === (code === undefined ? "red" : "black") && data.nickname === nickname.trim() &&
      (code === undefined || data.roomCode === code)) return data;
  if (isBackendError(data, response.status)) throw failure(errorMessages[data.code]);
  if (record(data) && ["BAD_GATEWAY", "UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE"].includes(String(data.code))) {
    throw failure("Chưa nhận được kết quả chắc chắn từ backend. Yêu cầu có thể đã thành công; không tự gửi lại POST.");
  }
  if (record(data) && data.code === "CONFIG_ERROR") throw failure("Chưa cấu hình địa chỉ backend HTTP.");
  throw failure("Response không đúng hợp đồng. Yêu cầu có thể đã thành công; không tự gửi lại POST.");
}
