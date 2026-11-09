import { loadServerEnv } from "../../../db/config";
import { SmtpMailer } from "./smtp-mailer";

async function main(): Promise<void> {
  loadServerEnv();
  if (process.env.OTP_MAIL_MODE !== "smtp") throw new Error("Chọn OTP_MAIL_MODE=smtp trong apps/server/.env trước khi kiểm tra.");
  const mailer = new SmtpMailer();
  try { await mailer.verify(); }
  catch { throw new Error("Không kết nối/xác thực được SMTP. Kiểm tra mạng, SMTP_HOST, cổng/TLS và mật khẩu ứng dụng; không chia sẻ bí mật."); }
  console.log("SMTP: kết nối TLS và xác thực thành công. Chưa gửi thư; chưa xác nhận chấp nhận thư hoặc đến hộp thư.");
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Kiểm tra SMTP thất bại."); process.exitCode = 1; });
