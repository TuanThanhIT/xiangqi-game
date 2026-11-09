# Refactor cấu trúc Auth

Đây là thay đổi tổ chức file sau Đăng nhập/Đăng ký/OTP, không thêm tính năng.
Các thay đổi có sẵn được giữ lại. Không sửa schema, migration, .env, dependency,
URL, endpoint, status/mã lỗi, cookie, quy tắc phiên hoặc OTP.

## Trước refactor

Backend `apps/server/src/auth/` có 14 file cùng một cấp:

```text
auth/
├── auth.module.ts
├── auth.config.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.guard.ts
├── origin.guard.ts
├── login.pipe.ts
├── registration.controller.ts
├── registration.service.ts
├── registration.pipe.ts
├── password.ts
├── fixture.ts
├── otp-mailer.ts
└── otp-local.ts
```

Frontend `apps/web/src/features/auth/` cũng phẳng:

```text
auth/
├── AuthShell.tsx
├── PasswordField.tsx
├── LoginForm.tsx
├── RegisterForm.tsx
├── VerifyEmailForm.tsx
├── ProtectedLobby.tsx
├── auth.module.css
├── auth-client.ts
├── auth-contract.ts
└── auth-proxy.ts
```

## Sau refactor

```text
apps/server/src/auth/
├── auth.module.ts
├── auth.config.ts
├── auth.controller.ts
├── auth-clock.ts
├── password.ts
├── login/
│   ├── login.pipe.ts
│   ├── login.service.ts
│   └── fixture.ts
├── registration/
│   ├── registration.controller.ts
│   ├── registration.pipe.ts
│   └── registration.service.ts
├── otp/
│   ├── otp.service.ts
│   ├── verification.pipe.ts
│   └── delivery/
│       ├── otp-mailer.ts
│       └── otp-local.ts
├── session/
│   └── session.service.ts
└── guards/
    ├── auth.guard.ts
    └── origin.guard.ts

apps/web/src/features/auth/
├── AuthShell.tsx
├── PasswordField.tsx
├── auth.module.css
├── auth-client.ts
├── auth-contract.ts
├── auth-proxy.ts
├── login/
│   └── LoginForm.tsx
├── registration/
│   └── RegisterForm.tsx
├── otp/
│   └── VerifyEmailForm.tsx
└── session/
    └── ProtectedLobby.tsx
```

## Ranh giới trách nhiệm

- LoginService nhận phần tìm tài khoản, kiểm tra mật khẩu/trạng thái từ
  AuthService cũ; sau đó gọi SessionService.create để mở phiên.
- SessionService nhận phần tạo phiên/token, refresh, logout và xác thực Bearer
  từ AuthService cũ. AUTH_CLOCK chuyển lên auth-clock.ts để các luồng dùng chung
  token DI mà không phải import service của luồng khác.
- RegistrationService giữ đăng ký, giải phóng hồ sơ hết hạn, xử lý unique và
  đưa hồ sơ pending từ login sang OTP. OtpService nhận phần khóa email, quota,
  gửi mã, trạng thái, gửi lại và xác minh từ RegistrationService cũ.
- Đăng ký vẫn mở đúng transaction cũ, truyền `tx` vào OtpService.lock/state/send.
  Không mở transaction phụ ở những chỗ này. Xác minh vẫn cập nhật account và
  tiêu thụ OTP trong cùng transaction; tăng lần sai vẫn commit trước khi trả lỗi.
- Chỉ tách thêm `otp/delivery/` vì đã có mailer và CLI đọc hộp thư. Không tạo
  thêm `verification/` hoặc Nest module cho từng thư mục.
- Hai controller còn gọn được giữ: AuthController chung ở auth/, RegistrationController
  ở registration/ chuyển các endpoint OTP tới OtpService. AuthModule vẫn là điểm
  đăng ký duy nhất, giữ DatabaseModule, không thêm exports hoặc module mới.
- password.ts vẫn dùng chung ở auth/. Frontend giữ shell, CSS, PasswordField,
  API client, proxy và contract ở cấp chung. `app/` vẫn chứa route/layout, URL
  và điều hướng không đổi; bốn component chỉ thay import theo vị trí mới.

## Import và đường dẫn công cụ

Đã cập nhật route Next.js, module/controller/guard NestJS, unit test, script
CommonJS kiểm thử và Playwright. Không để shim hoặc re-export ở đường dẫn cũ.
Các script vẫn giữ tên gọi:

- auth:fixture → `src/auth/login/fixture.ts`.
- otp:local → `src/auth/otp/delivery/otp-local.ts`.

Điều chỉnh độ sâu `__dirname` của fixture và mailer để vẫn trỏ đúng
`apps/server/.env` và `.tmp/otp-mailbox/`, ở cả src và dist.
Đã chạy cả hai lệnh thật với fixture và một đăng ký local riêng; stdout chứa OTP
được capture để kiểm tra, không đưa ra log/báo cáo. Tài khoản/mailbox tạm đã dọn;
fixture riêng hiện có vẫn được giữ. File .env được đối chiếu checksum trước/sau.

Playwright có tùy chọn AUTH_SCREENSHOTS_DIR để đợt refactor ghi ảnh vào `.tmp/`,
không ghi đè ảnh nghiệm thu trước. Bổ sung bước reload trong bài đăng ký trước
logout để kiểm tra đầy đủ chuỗi đăng ký → OTP → login → lobby → reload → logout.

## Kiểm tra thực tế

Đã chạy từ thư mục gốc bằng npm.cmd:

```powershell
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run test:auth --workspace=@xiangqi/server
npm.cmd run test:registration --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
# Backend build đã chạy trong test:auth/test:registration.
npm.cmd run auth:fixture --workspace=@xiangqi/server
# otp:local đã chạy với email test riêng, stdout được giữ kín.
$env:AUTH_SCREENSHOTS_DIR='../../.tmp/auth-refactor-screenshots'
npm.cmd run test:e2e --workspace=@xiangqi/web
git diff --check
npm.cmd run db:check --workspace=@xiangqi/server
```

Kết quả:

- test:auth và test:registration đạt, nạp JavaScript CommonJS đã build.
- 51 test backend và 76 test frontend đạt; frontend lint/build, backend
  typecheck/build và diff check đạt. Backend chưa có script lint riêng.
- 4 bài Playwright đạt trên desktop 1366×768 và mobile 375×812, gồm cả hai
  luồng auth/đăng ký, paste OTP, reload và logout.
- Đồ thị import runtime cục bộ từ Auth không có vòng; Nest khởi tạo được đầy
  đủ provider. AuthModule vẫn không khai báo exports.
- Đối chiếu trước/sau: component frontend giữ nguyên JSX/logic; CSS, ảnh,
  asset, .env, schema, migration và package-lock.json giữ nguyên byte.
  Các hàm OTP/session và callback transaction đăng ký giữ nguyên nội dung,
  ngoài chuyển lời gọi sang service chịu trách nhiệm tương ứng.
- db:check vẫn SELECT 1 = 1, database xiangqi_dev, role xiangqi_app; 2 migration
  cũ còn nguyên, không chạy migrate trong đợt refactor.

Phạm vi kiểm thử là môi trường local và Chrome hiện có. Không thử gửi mail thật
hoặc deploy production; cơ chế local mail hiện có không thay đổi. Quên mật khẩu
và Sảnh chính đầy đủ chưa triển khai. Không commit/push/deploy.
