import { authAccessToken } from "../auth/auth-client";
export const casualErrors: Record<string,string> = {
  ACCOUNT_IN_ROOM:"Bạn đang giữ ghế ở một phòng khác. Hãy tiếp tục phòng đã lưu hoặc rời phòng đó trước.",
  NOT_ROOM_MEMBER:"Bạn không có quyền thao tác trong phòng này.", ROOM_NOT_FOUND:"Phòng không tồn tại hoặc đã đóng.",
  ROOM_FULL:"Phòng đã đủ hai người.", GAME_ALREADY_STARTED:"Trận đã bắt đầu. Vui lòng tiếp tục trên bàn cờ.",
  ROOM_OFFLINE:"Hãy chờ kết nối phòng rồi thử lại.", UNAUTHENTICATED:"Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
  SESSION_EXPIRED:"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", INVALID_REQUEST:"Kiểm tra lại thông tin phòng.",
  INVALID_ROOM_CODE:"Mã phòng không hợp lệ.",
};
export async function casualRequest(path:string, body:object, signal?:AbortSignal):Promise<unknown> {
  const token = await authAccessToken();
  let response:Response;
  try { response = await fetch(`/api/casual-rooms${path}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:signal??AbortSignal.timeout(12000),cache:"no-store"}); }
  catch { throw new Error("Chưa nhận được kết quả từ máy chủ. Kiểm tra kết nối; không tự gửi lại yêu cầu."); }
  const data:unknown = await response.json().catch(()=>null);
  if (!response.ok) {
    const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : "";
    throw new Error(Object.hasOwn(casualErrors,code) ? casualErrors[code] : "Chưa thể xử lý yêu cầu phòng. Vui lòng thử lại.");
  }
  return data;
}
