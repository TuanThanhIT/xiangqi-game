# Đăng ký và xác minh email bằng OTP

> Cấu trúc file hiện tại sau refactor: xem [auth-structure-refactor.md](./auth-structure-refactor.md).

## Phạm vi và cách dùng local

Mở `/login` → Đăng ký → nhập biệt danh/email/mật khẩu → Xác minh email.
Xác minh thành công quay về `/login?verified=1` với thông báo để người chơi tự
đăng nhập. Không tạo session hoặc cấp access/refresh token khi đăng ký/xác minh.
Đăng nhập đúng mật khẩu của hồ sơ chờ cũng dẫn tới màn OTP, không tự gửi mã mới.

Backend/frontend vẫn dùng Base, DatabaseService/Drizzle, filter lỗi, requestId,
Origin guard, proxy cùng origin, AuthShell/Notice và scrypt bất đồng bộ hiện có.
PasswordField được dùng chung giữa đăng nhập và đăng ký. Không thêm dependency.

Hiện có adapter SMTP cho email thật, hộp thư local và bộ gửi giả trong test.
Không cần SMTP/API key để thử local. `OTP_MAIL_MODE=local` là giá trị mặc định
ngoài production; có mẫu trong `apps/server/.env.example`. Nếu muốn khai báo
tường minh, điền vào `apps/server/.env`, không đưa bí mật vào chat.

```powershell
# Từ thư mục gốc, các terminal riêng:
npm.cmd run dev:server
npm.cmd run dev:web
# Sau khi đăng ký trên giao diện, đọc thư local của email đã nhập:
npm.cmd run otp:local --workspace=@xiangqi/server -- your-email@example.test
```

Lệnh cuối là trình đọc OTP dành riêng local, chủ động in mã ra terminal của bạn;
không chạy qua HTTP hoặc logger ứng dụng. Mã không có trong API, URL, console
log thông thường hoặc ảnh nghiệm thu. Hộp thư ở `.tmp/otp-mailbox/`, ngoài public
và được Git bỏ qua; tên file là SHA-256 khóa email. Chỉ thư mới nhất của email
được giữ, có thể đã hết hạn/đã tiêu thụ nên backend vẫn quyết định tính hợp lệ.
Không chia sẻ thư local hoặc ảnh có mã với người khác.

Local mailer từ chối production, database khác `xiangqi_dev` hoặc host PostgreSQL
khác localhost/127.0.0.1/::1. Lệnh đọc còn kiểm tra tên database thực tế. Gửi thất
bại giữ hồ sơ chờ, giao diện cho biết chưa có mã còn hiệu lực/cho phép gửi lại.
Chọn `OTP_MAIL_MODE=smtp` để gửi thật theo cấu hình bên dưới. Không dùng giá trị mẫu
để gửi thật hoặc coi thư local là email đã đến hộp thư.

## Gmail SMTP

Điền trong `apps/server/.env` đang được Git bỏ qua; không gửi bí mật vào chat:

```dotenv
OTP_MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sender@gmail.com
SMTP_PASSWORD=YOUR_GOOGLE_APP_PASSWORD
SMTP_FROM=your-sender@gmail.com
```

`SMTP_USER` và `SMTP_FROM` là cùng địa chỉ Gmail gửi. `SMTP_PASSWORD` là mật khẩu
ứng dụng Google, không phải mật khẩu đăng nhập Gmail; nhập liền không có khoảng trắng
phân nhóm. Bật xác minh hai bước và tạo mật khẩu ứng dụng trong tài khoản Google.
Tùy chọn khác: cổng 587, `SMTP_SECURE=false`; adapter bắt buộc nâng cấp STARTTLS.
Không tắt kiểm tra chứng chỉ TLS. Production bắt buộc chọn SMTP, không fallback local.
Khi chọn SMTP mà thiếu biến, backend dừng khởi động và chỉ nêu tên biến bị thiếu.

```powershell
# Dừng backend cũ bằng Ctrl+C, rồi khởi động lại để đọc cấu hình mới:
npm.cmd run dev:server
# Terminal khác: chỉ kiểm tra kết nối TLS/xác thực, không gửi email:
npm.cmd run smtp:check --workspace=@xiangqi/server
```

Sau đó đăng ký bằng email thật trên giao diện, mở hộp thư (kể cả Spam), nhập mã.
Email tiếng Việt, ghi rõ hiệu lực 5 phút; người nhận lấy từ tài khoản đã đăng ký.
`smtp:check` thành công chỉ chứng minh kết nối/xác thực, không chứng minh thư được
chấp nhận. API trả `delivery=sent` sau khi SMTP chấp nhận người nhận/thư và DB commit;
không đồng nghĩa thư đã đến Inbox. Việc đến hộp thư phải do người nhận xác nhận.
Lỗi SMTP giữ hợp đồng Base hiện có: trạng thái `delivery=failed` an toàn để giao diện
hiển thị lỗi, không lộ phản hồi SMTP, địa chỉ hay OTP; mã cũ còn hạn vẫn dùng được.
Không tự retry POST. `otp:local` chỉ dùng khi chạy chế độ local, không đọc thư SMTP.

Adapter dùng `nodemailer@10.3.1`, kiểu development `@types/nodemailer@8.0.2`.
Tham khảo: [Nodemailer SMTP](https://nodemailer.com/smtp),
[cấu hình Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp),
[mật khẩu ứng dụng Google](https://support.google.com/accounts/answer/185833).

SMTP và DB không có giao dịch phân tán: nếu kết nối mất sau khi server đã nhận thư
hoặc transaction kích hoạt lỗi sau khi gửi, có thể có thư chứa mã chưa kích hoạt.
Không retry tự động; yêu cầu gửi lại theo hạn mức. Gửi lỗi hoặc kích hoạt lỗi
không vô hiệu mã cũ trong DB.

Nghiệm thu tích hợp SMTP: typecheck/build backend đạt; 53 test backend đạt,
`test:registration` và `test:auth` đạt. Playwright `registration.spec.mjs` đạt 2/2
trên desktop/mobile bằng hộp thư local; kiểm tra adapter SMTP bằng transport giả
cho chấp nhận, từ chối và lỗi kết nối. `git diff --check` đạt.
`smtp:check` đã chạy và dừng đúng vì môi trường hiện chưa chọn SMTP.
Chưa kiểm chứng kết nối/xác thực Gmail, SMTP nhận thư thật hoặc thư tới hộp thư.
Các kết quả và giới hạn ở phần cuối tài liệu là lịch sử nghiệm thu trước tích hợp SMTP.

## Schema và giao dịch

Migration mới: `apps/server/drizzle/0001_dear_proteus.sql` và snapshot/journal mới.
Không sửa `0000_cultured_marten_broadcloak.sql` đã áp dụng.

- `auth_email_otps`: account FK cascade, purpose, HMAC digest, sent/expires,
  failed_attempts, consumed_at, invalidated_at. Check giới hạn lần sai 0–5,
  hạn sau ngày gửi; unique partial index chỉ cho một OTP chưa tiêu thụ/vô hiệu
  trên mỗi account/purpose.
- `auth_email_sends`: khóa email chuẩn hóa, purpose, attempted/sent, trạng thái
  sent/failed. Không FK tới account, để xóa hồ sơ chờ không xóa lịch sử hạn mức.
  Các purpose email_verification/password_reset dùng cùng namespace quota email;
  chưa triển khai endpoint password reset.

Đăng ký dùng chuẩn hóa của PostgreSQL tương ứng generated keys hiện có, bỏ/gộp
khoảng trắng biệt danh và giữ cách viết hoa hiển thị. Unique keys và
`INSERT ... ON CONFLICT DO NOTHING` xử lý cạnh tranh biệt danh/email.
Hồ sơ chưa xác minh hết đúng 24 giờ được xóa theo nhu cầu khi email hoặc biệt
danh đó được đăng ký lại; không phụ thuộc cron. Tài khoản đã xác minh không bị xóa.
Email đang chờ còn hạn trả lại account ID/trạng thái, giữ nguyên hash mật khẩu,
biệt danh và deadline; không gửi thêm OTP.

Gửi OTP dùng ba pha ngắn: transaction đầu khóa domain `auth-email:<email>`, kiểm
tra cooldown/quota rồi commit account và delivery reservation; mailer chạy sau
khi transaction, connection và lock đã được nhả; transaction cuối lấy lại cùng
khóa để đối chiếu reservation, đánh dấu gửi thành công, vô hiệu mã cũ và kích
hoạt mã mới. Xác minh vẫn khóa giao dịch theo email và khóa account/OTP. Hạn mức
là 60 giây giữa email gửi thành công, tối đa 5 email
trong cửa sổ `(now - 1 giờ, now]`, dùng chung mọi purpose. Lần gửi thất bại được
gỡ reservation nên không tính thành email đã gửi và có thể retry an toàn. Khi mailer xác nhận gửi xong,
mã cũ mới bị vô hiệu và OTP mới có hạn 5 phút từ thời điểm gửi được ghi nhận.
Gửi lại không sửa hạn giữ hồ sơ.

Nếu SMTP thành công nhưng transaction kích hoạt thất bại, reservation không được
tự biến thành OTP hợp lệ: email đó có thể chứa mã không dùng được, request sau
phải tạo challenge mới. Reservation chưa hoàn tất chặn request đồng thời trong
tối đa 60 giây; request xen giữa hai pha chỉ thấy hồ sơ pending và OTP cũ còn
hiệu lực, không tự kích hoạt mã chưa commit.

OTP gồm 6 chữ số từ crypto.randomInt. HMAC-SHA256 có nhãn phiên bản, purpose,
OTP ID và account ID, dùng khóa AUTH_ACCESS_SECRET hiện có; không lưu plaintext
trong DB. So sánh digest bằng timingSafeEqual. Mã mới khác mã ngay trước đó.
Sai lần thứ 5 vô hiệu mã. Cập nhật lần sai được commit trước khi trả lỗi, không
bị rollback do exception. Xác minh account và tiêu thụ OTP trong cùng transaction;
hai xác minh đồng thời chỉ một request thành công.

## API và giao diện

Các POST sau đi qua `/api/auth/...` của Next.js tới `/auth/...` của NestJS:

| Endpoint | Input | Kết quả |
| --- | --- | --- |
| register | email, nickname, password | Trạng thái hồ sơ chờ, email che bớt, mốc hạn/gửi lại |
| verification/start | email, password | Kiểm tra đúng mật khẩu rồi trả trạng thái chờ; không gửi mã |
| verification/status | accountId | Trạng thái chờ/mốc gửi lại; không gửi mã |
| verification/resend | accountId | Gửi lại nếu đủ hạn mức, không gia hạn hồ sơ |
| verification/verify | accountId, code | `{ ok: true }`, không token/cookie phiên |

Giữ lỗi `{ statusCode, code, message }`; no-store và requestId xuyên proxy.
Các POST dùng Origin guard, không tự retry. Proxy whitelist response OTP và từ
chối field ngoài contract (kể cả field chứa mã). Account ID trên URL chỉ là ID
hồ sơ; không phải token đăng nhập. Email hiển thị trên màn OTP đã được che bớt.

`/register` và `/verify-email` dùng cùng nền/asset và panel auth đã duyệt. Một
input OTP native có autocomplete=one-time-code/inputMode=numeric, sáu ô hiển
thị trang trí; hỗ trợ dán cả mã, Tab/Enter và focus. Có countdown gửi lại, lỗi
mã sai/hết hạn, thông báo lỗi mạng và lối đăng ký lại khi hồ sơ hết hạn.
Nếu tab khác vừa dùng quota, client đọc lại mốc chờ, không tự gửi lại request gửi mail.

## Kiểm tra và lệnh chạy lại

```powershell
npm.cmd run db:check --workspace=@xiangqi/server
npm.cmd run test:registration --workspace=@xiangqi/server
npm.cmd run test:auth --workspace=@xiangqi/server
npm.cmd run test:e2e --workspace=@xiangqi/web
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Playwright cần hai dịch vụ local cổng 3000/3001 và Chrome hiện có. Test tạo tài
khoản/email riêng, đọc mã local trực tiếp từ file mà không in mã, rồi xóa chính
dữ liệu/mailbox của test. Test backend tích hợp dùng mailer giả trong bộ nhớ và
clock điều khiển để kiểm tra chính xác mốc thời gian; dữ liệu thử được dọn theo
email riêng, không sửa tài khoản người dùng.

Kết quả thực tế:

- DB `xiangqi_dev`, role `xiangqi_app`, SELECT 1 = 1. Đã generate, đọc SQL rồi
  migrate; chạy lại migrate không thêm lịch sử. Hiện 2 migration; generate lại
  báo không có thay đổi schema.
- Test tích hợp đăng ký/OTP đạt: trùng biệt danh/cùng email đồng thời, pending
  không bị ghi đè, giải phóng email/tên hết 24 giờ, mã hết đúng 5 phút, sai 5 lần,
  giới hạn 60 giây và 5 email trong giờ trượt ở đúng ranh giới, quota dùng chung
  purpose, resend/verify đồng thời, mã cũ sau resend và thất bại gửi giữ mã cũ.
- Hồi quy JWT CommonJS, login/refresh/logout đạt, gồm thu hồi access cũ và phiên
  độc lập. Test backend 51 test; frontend 76 test. Typecheck, lint frontend và
  build cả hai ứng dụng đạt. Backend chưa có lint riêng, không cài thêm công cụ.
- Playwright 4 test đạt (desktop 1366×768, mobile 375×812): đăng ký → OTP → login
  → lobby, login tài khoản pending → OTP không gửi mail thêm, sai mã, lỗi mạng,
  paste clipboard thật, no-store/requestId, không tạo cookie phiên trước login;
  kèm toàn bộ luồng login/reload/logout cũ. Form không tràn ngang ở 375px.

Ảnh đã mở/đối chiếu hai cột trong `docs/design/02-auth-screens.png`:
`docs/design/screenshots/registration/register-{desktop,mobile}.png`,
`otp-{desktop,mobile}.png`, `otp-error-{desktop,mobile}.png`,
`verified-{desktop,mobile}.png`. Mã được xóa khỏi input trước khi chụp ảnh lỗi.

## File thêm/sửa và giới hạn

- Backend: schema.ts; migration 0001/meta; registration service/controller/pipe;
  otp-mailer, otp-local; auth.module/auth.service; filter lỗi; .env.example;
  package.json; tests/auth-input.test.ts; scripts/test-registration.cjs.
- Frontend: RegisterForm, VerifyEmailForm, PasswordField; LoginForm; auth contract,
  client, proxy, CSS; route register/verify-email/login và các Route Handler mới;
  tests/menu, tests/registration; e2e/auth và e2e/registration.
- Tài liệu này và ảnh nghiệm thu. Không thêm dependency hoặc sửa lockfile trong
  lượt OTP; các thay đổi có sẵn từ Base/Đăng nhập vẫn được giữ.

Chưa gửi/kiểm chứng email thật, DNS mail hoặc production HTTPS. Mail local và DB
không phải một hệ thống giao dịch phân tán: nếu tiến trình/DB gặp sự cố ngay sau
khi ghi thư nhưng trước commit, thư có thể chứa mã không dùng được; người dùng
yêu cầu gửi lại. Cần chốt semantics giao nhận/idempotency trước khi nối provider thật.
Chưa thêm cron dọn nền; giải phóng khóa hết hạn đã hoạt động ngay trong đăng ký.
Quên mật khẩu, quà khởi đầu và sảnh đầy đủ thuộc lượt sau. Không commit/push/deploy.
