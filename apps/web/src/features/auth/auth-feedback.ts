import { AuthRequestError } from "./auth-client";
import { authMessages } from "./auth-contract";

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (Object.hasOwn(authMessages, error.code)) return authMessages[error.code];
    if (error.code === "NETWORK_ERROR") return "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  }
  return "Chưa thể xử lý yêu cầu. Vui lòng thử lại sau.";
}

// One browser-memory handoff across register -> verification; no OTP or credentials.
let failedDeliveryAccount: string | null = null;
export const rememberDeliveryFailure = (accountId: string) => { failedDeliveryAccount = accountId; };
export const hasDeliveryFailure = (accountId: string) => failedDeliveryAccount === accountId;
export const clearDeliveryFailure = () => { failedDeliveryAccount = null; };
export const deliveryFailureMessage = "Chưa gửi được mã xác minh. Vui lòng thử Gửi lại mã.";
