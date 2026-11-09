export interface Profile {
  id: string;
  email: string;
  nickname: string;
  avatar: { id: string; name: string; assetPath: string | null };
}
export interface AuthResult { accessToken: string; expiresAt: string; profile: Profile }
export interface VerificationState {
  status: "pending_verification"; accountId: string; maskedEmail: string;
  pendingExpiresAt: string; otpExpiresAt: string | null; resendAt: string; delivery: "sent" | "not_sent" | "failed";
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every((n) => Object.hasOwn(v, n));
export function isProfile(v: unknown): v is Profile {
  return object(v) && exact(v, ["id", "email", "nickname", "avatar"]) && typeof v.id === "string" &&
    typeof v.email === "string" && typeof v.nickname === "string" && object(v.avatar) &&
    exact(v.avatar, ["id", "name", "assetPath"]) && typeof v.avatar.id === "string" && typeof v.avatar.name === "string" &&
    (v.avatar.assetPath === null || typeof v.avatar.assetPath === "string");
}
export function isAuthResult(v: unknown): v is AuthResult {
  return object(v) && exact(v, ["accessToken", "expiresAt", "profile"]) && typeof v.accessToken === "string" &&
    v.accessToken.length > 0 && typeof v.expiresAt === "string" && Number.isFinite(Date.parse(v.expiresAt)) && isProfile(v.profile);
}
export function isVerificationState(v: unknown): v is VerificationState {
  return object(v) && exact(v, ["status", "accountId", "maskedEmail", "pendingExpiresAt", "otpExpiresAt", "resendAt", "delivery"]) &&
    v.status === "pending_verification" && typeof v.accountId === "string" && /^[0-9a-f-]{36}$/i.test(v.accountId) &&
    typeof v.maskedEmail === "string" && typeof v.pendingExpiresAt === "string" && Number.isFinite(Date.parse(v.pendingExpiresAt)) &&
    (v.otpExpiresAt === null || typeof v.otpExpiresAt === "string" && Number.isFinite(Date.parse(v.otpExpiresAt))) &&
    typeof v.resendAt === "string" && Number.isFinite(Date.parse(v.resendAt)) && ["sent", "not_sent", "failed"].includes(String(v.delivery));
}
export const authMessages: Record<string, string> = {
  INVALID_REGISTRATION_INPUT: "Kiểm tra email, mật khẩu và biệt danh.",
  INVALID_NICKNAME: "Biệt danh cần từ 1 đến 30 ký tự.",
  EMAIL_IN_USE: "Email đã có tài khoản. Vui lòng đăng nhập.",
  NICKNAME_IN_USE: "Biệt danh đã được sử dụng.",
  REGISTRATION_EXPIRED: "Hồ sơ chờ đã hết hạn 24 giờ. Vui lòng đăng ký lại.",
  INVALID_OTP_INPUT: "Nhập mã xác minh gồm 6 chữ số.",
  OTP_INVALID: "Mã xác minh không đúng.",
  OTP_EXPIRED: "Mã đã hết hiệu lực. Vui lòng yêu cầu mã mới.",
  OTP_LOCKED: "Mã đã hết hiệu lực sau 5 lần nhập sai. Vui lòng yêu cầu mã mới.",
  OTP_ALREADY_USED: "Email đã được xác minh. Vui lòng đăng nhập.",
  OTP_SEND_LIMIT: "Chưa thể gửi lại: cách nhau ít nhất 60 giây, tối đa 5 email mỗi giờ.",
  INVALID_LOGIN_INPUT: "Kiểm tra địa chỉ email và mật khẩu đã nhập.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  EMAIL_NOT_VERIFIED: "Email chưa được xác minh. Xác minh email sẽ được mở ở bước tiếp theo.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  UNAUTHENTICATED: "Vui lòng đăng nhập để tiếp tục.",
  ORIGIN_NOT_ALLOWED: "Không thể xác nhận nguồn yêu cầu. Hãy mở lại trang từ cổng game.",
  INTERNAL_ERROR: "Chưa thể xử lý yêu cầu. Vui lòng thử lại sau.",
  INVALID_JSON: "Dữ liệu gửi lên không hợp lệ.",
};
