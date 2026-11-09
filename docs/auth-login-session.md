# Prompt 2: đăng nhập và duy trì phiên

> Cấu trúc file hiện tại sau refactor: xem [auth-structure-refactor.md](./auth-structure-refactor.md).

## Đầu ra và phạm vi

Đăng nhập tài khoản thật trong PostgreSQL qua `/login`, vào sảnh tạm `/lobby`,
tải lại vẫn giữ phiên bằng cookie HttpOnly, đăng xuất rồi mở sảnh sẽ trở về
đăng nhập. Khách vẫn mở `/local`. Cổng giữ header Đăng nhập; nút Vào game đi
qua sảnh để kiểm tra phiên trước khi hiện hồ sơ hoặc điều hướng.

Không triển khai đăng ký, OTP, quên mật khẩu hoặc sảnh hoàn chỉnh. Nút Đăng ký
hiện thông báo chưa mở ngay tại form, không dẫn tới 404. API phòng và Socket.IO
V1 giữ nguyên; chưa áp dụng AuthGuard vào phòng V1 trong lượt này.

## Thiết kế backend và phiên

- `apps/server/src/auth/`: controller, LoginPipe, AuthService, AuthGuard,
  AuthOriginGuard, cấu hình cookie/JWT, hàm hash/verify mật khẩu và fixture local.
- Tái sử dụng DatabaseService/Drizzle, filter lỗi và requestId Base. Thêm mã lỗi
  auth vào filter, giữ `{ statusCode, code, message }`, không trả đối tượng lỗi
  driver hoặc thông tin xác thực. Cả phản hồi thành công/lỗi auth đều no-store.
- Mật khẩu dùng scrypt bất đồng bộ từ Node crypto: N=32768, r=8, p=1, salt
  ngẫu nhiên 16 byte riêng, key 64 byte, digest có phiên bản/tham số cố định.
  Tài khoản không tồn tại vẫn thực hiện scrypt; email không tồn tại và mật khẩu
  sai cùng trả INVALID_CREDENTIALS. Chỉ trả EMAIL_NOT_VERIFIED sau khi đúng mật khẩu.
- Refresh token ngẫu nhiên 32 byte riêng cho từng phiên; DB chỉ lưu SHA-256
  digest trong `sessions.refresh_token_hash`. Hạn tuyệt đối 7 ngày từ login.
  Refresh không sửa cookie/token và không cập nhật hạn phiên. Không cần migration.
- JWT HS256, có issuer/audience/type, subject tài khoản và session ID. Access
  token tối đa 15 phút, làm tròn xuống và không vượt hạn phiên. `/me` kiểm tra
  chữ ký/hạn token rồi kiểm tra phiên chưa thu hồi/chưa hết hạn trong DB.
- Logout dựa vào refresh cookie để thu hồi đúng phiên; xóa cookie đúng path.
  Access token cũ bị từ chối sau logout. Phiên độc lập khác không bị thu hồi.
  Khi làm reset mật khẩu ở lượt sau, cần thu hồi tất cả phiên của tài khoản.

| API NestJS | Route cùng origin của Next.js | Kết quả |
| --- | --- | --- |
| POST /auth/login | POST /api/auth/login | 200 + accessToken/expiresAt/profile; Set-Cookie |
| POST /auth/refresh | POST /api/auth/refresh | 200 + accessToken/expiresAt/profile mới; không đổi cookie |
| POST /auth/logout | POST /api/auth/logout | 200 `{ ok: true }`; xóa cookie |
| GET /me | GET /api/me | Hồ sơ tối thiểu; yêu cầu Bearer access token |

Cookie `xq_refresh`: HttpOnly, SameSite=Lax, Path=/api/auth, Expires cố định;
production thêm Secure. Không đặt Domain nên cookie thuộc host frontend.
Các POST auth (kể cả login) kiểm tra Origin ở cả proxy và NestJS. NestJS mặc
định cho phép localhost/127.0.0.1:3000 trên local; production bắt buộc cấu hình
AUTH_WEB_ORIGIN là HTTPS origin. Proxy không tin client tự chỉ định backend.

## Frontend và tái sử dụng Base

`features/auth/` chứa auth shell, form, sảnh bảo vệ, contract, proxy và client
giữ access token chỉ trong bộ nhớ JavaScript. Không ghi token vào storage/URL.
Khung auth dùng lại CSS/asset sân vườn, header gỗ, nút đỏ son và Notice hiện có.
Nhãn, autocomplete, focus, lỗi cạnh form, hiện/ẩn mật khẩu và mobile 375px đã kiểm tra.

Phần fetch/timeout/JSON/lỗi mạng Base được tách tối thiểu sang
`features/shared/backend-http.ts`, dùng cho cả phòng và auth. Cấu hình backend
và kiểm tra requestId Base được dùng lại. Proxy không tự retry POST, chỉ chuyển
cookie refresh đã whitelist; Set-Cookie được chuyển từng header riêng, không
tách bằng dấu phẩy vì Expires có dấu phẩy.

Một tab gom refresh đồng thời thành một request đang chờ; nhiều tab có thể
refresh cùng token cố định. Mất response có thể chủ động thử lại với cookie cũ.
Sảnh tự refresh khi access token gần hết hạn, chờ kiểm tra trước khi hiện hồ sơ.
401 đưa về login; lỗi mạng/gateway giữ trang có nút Thử lại. Logout thông báo
các tab cùng browser bằng BroadcastChannel; không gửi token qua kênh này.

## Dependency và cấu hình local

Đã duyệt và cài `jose@6.2.15` (backend), `@playwright/test@1.64.1` (frontend dev).
Đã chạy trên Node 22.17.0. Backend vẫn CommonJS; `test:auth` nạp trực tiếp các
file `dist/*.js` để kiểm tra jose ký/xác minh thực sự ở runtime.

`apps/server/.env` được Git bỏ qua, giữ DATABASE_URL hiện có; đã bổ sung khóa
ngẫu nhiên AUTH_ACCESS_SECRET và mật khẩu fixture AUTH_FIXTURE_PASSWORD tại máy.
Không in các giá trị này ra log/chat. `.env.example` chỉ chứa mẫu, không có khóa thật.
Khi chuyển máy, tự tạo khóa ngẫu nhiên ít nhất 32 byte và điền local. Không thay
khóa của môi trường đang dùng nếu chưa có kế hoạch vô hiệu access token cũ.

Fixture đã xác minh dành riêng local: email `login.fixture@xiangqi.test`, biệt danh
`Kỳ thủ thử nghiệm`; mật khẩu xem AUTH_FIXTURE_PASSWORD trong file local nói trên.
Lệnh fixture chỉ chạy trên xiangqi_dev, từ chối production và xung đột email với
account khác. Chạy lại cập nhật hash của chính fixture, không sửa tài khoản khác.

## Chạy lại từ thư mục gốc (PowerShell)

Các file thêm/sửa trong lượt này:

- Backend: `src/auth/*`, `src/app.module.ts`, `src/http-error.filter.ts`,
  `src/db/config.ts` (tách hàm đọc env dùng chung), `.env.example`, `package.json`,
  `tests/auth-input.test.ts`, `scripts/test-auth.cjs`.
- Frontend: `src/features/auth/*`, `src/features/shared/backend-http.ts`,
  `src/features/rooms/room-proxy.ts`, `src/components/MainMenu.tsx`,
  `src/app/login/page.tsx`, `src/app/lobby/page.tsx`, `src/app/api/auth/*/route.ts`,
  `src/app/api/me/route.ts`, `tests/auth.test.mjs`, `tests/menu.test.mjs`,
  `e2e/auth.spec.mjs`, `playwright.config.mjs`, `package.json`.
- Repo: `.gitignore`, `package-lock.json`, tài liệu này và ảnh nghiệm thu.
  `apps/server/.env` được cập nhật local, vẫn bị Git bỏ qua. Các thay đổi Base
  và frontend có sẵn trước lượt này được giữ lại.

```powershell
npm.cmd run db:check --workspace=@xiangqi/server
npm.cmd run auth:fixture --workspace=@xiangqi/server
npm.cmd run dev:server
# Terminal khác:
npm.cmd run dev:web
# Terminal kiểm tra:
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

Playwright dùng Chrome đã cài trên máy, backend cổng 3001 và frontend cổng 3000;
không tự dừng/thay tiến trình đang chạy. Trace/video tắt để không lưu token/cookie
trong artifact. Kết quả tạm trong `.tmp/` được Git bỏ qua. Nếu chưa có fixture
hoặc Chrome, chạy hai lệnh tạo fixture/cài Chrome phù hợp trước khi kiểm thử.
Backend chưa có script lint riêng; không thêm công cụ lint ngoài hai dependency đã duyệt.

## Kết quả kiểm chứng

- SELECT 1 = 1, database xiangqi_dev, role xiangqi_app; migration vẫn một bản ghi,
  các bảng avatars/accounts/sessions giữ nguyên. Không sửa SQL đã áp dụng.
- 50 test backend và 75 test frontend đạt; typecheck/backend build, frontend
  lint/build đạt.
- Test auth bằng CommonJS đã build đạt: đúng/sai mật khẩu, chưa xác minh,
  Origin không hợp lệ/thiếu, JWT giả/hết hạn, không lộ hash, cookie/digest,
  refresh đồng thời, retry khi bỏ response, mốc 15 phút và chính xác 7 ngày,
  logout thu hồi access cũ nhưng giữ phiên độc lập khác. Dữ liệu test ngẫu nhiên
  được xóa theo ID sau test; fixture local riêng được giữ lại để bạn thử.
- Playwright desktop 1366×768 và mobile 375×812 đều đạt: cổng → login → sảnh →
  reload → logout → mở lại sảnh; lỗi sai mật khẩu, hiện/ẩn, Tab/Enter, form không
  tràn ngang, mạng lỗi có Thử lại, hai tab refresh đồng thời và refresh thành
  công ở server nhưng response bị chặn rồi retry vẫn được. Kiểm tra cookie và
  Web Storage không chứa token. Local vẫn có 90 giao điểm.
- Đã xem ảnh và đối chiếu cột Đăng nhập trong `docs/design/02-auth-screens.png`:
  cùng nền sân vườn/nâu, header gỗ tối, panel viền đồng, chữ tiếng Việt, nút đỏ son.
  Dùng asset hiện có nên bố cục cảnh nền ở màn hình rộng khác tỷ lệ cột minh họa.

Ảnh trong `docs/design/screenshots/auth/`:

- `login-desktop.png`, `login-mobile.png`: form ban đầu.
- `login-error-desktop.png`, `login-error-mobile.png`: lỗi cạnh form (mật khẩu đã xóa).
- `lobby-desktop.png`, `lobby-mobile.png`: sảnh sau tải lại.

HTTPS/cookie Secure production mới được kiểm tra bằng cấu hình và test, chưa
deploy để nghiệm thu HTTPS thực tế. Đăng ký, OTP, reset mật khẩu và sảnh đầy đủ
thuộc lượt sau. Không commit, push hoặc deploy.
