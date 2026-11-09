# Bước 2: kết nối và migration nền tài khoản

Backend dùng Drizzle ORM với `pg.Pool`, được NestJS tạo qua `DatabaseModule`
và đóng trong `onApplicationShutdown`. `/health` vẫn trả `{ "status": "ok" }`.
Không có kết nối kiểm tra hoặc migration tự động lúc khởi động.

## Cấu hình

- Node.js 22 (dự án hiện dùng 22.17.0); đọc `.env` bằng `loadEnvFile` tích hợp,
  không cần thêm thư viện cấu hình.
- Điền `DATABASE_URL` trong `apps/server/.env`, theo mẫu `apps/server/.env.example`.
  File local được `.gitignore` bỏ qua. Không đưa URL thật vào tài liệu hoặc log.
- NestJS và Drizzle Kit cùng gọi `src/db/config.ts`; biến môi trường tiến trình
  có ưu tiên cao hơn file local. Đường dẫn file không phụ thuộc thư mục chạy lệnh.
- `skipLibCheck` bỏ kiểm tra các file khai báo kiểu thư viện vì Drizzle kéo theo
  khai báo của các driver tùy chọn. Mã TypeScript của backend vẫn bật `strict`.

## Lệnh chạy từ thư mục gốc repo (PowerShell)

```powershell
npm.cmd run db:check --workspace=@xiangqi/server
npm.cmd run db:generate --workspace=@xiangqi/server
# Đọc và rà soát SQL trong apps/server/drizzle trước khi chạy lệnh dưới.
npm.cmd run db:migrate --workspace=@xiangqi/server
npm.cmd run db:verify --workspace=@xiangqi/server
npm.cmd run typecheck:server
npm.cmd run build:server
npm.cmd run test:server
git diff --check
```

`db:check` tạo Nest application context, dùng chính `DatabaseService` để chạy
`SELECT 1`, lấy database/role, liệt kê bảng và lịch sử migration rồi đóng pool.
`db:migrate` chạy kiểm tra này trước Drizzle Kit, từ chối nếu database không phải
`xiangqi_dev`. Không dùng script dành cho local này để migrate production.
Role được báo để đối chiếu; không bắt buộc tên role vì có thể chưa tạo role riêng.

`db:verify` kiểm tra `/health`, bản ghi avatar mặc định, unique email/biệt danh
sau chuẩn hóa, phân biệt dấu và giá trị mặc định 24 giờ/7 ngày. Mọi dữ liệu thử
nằm trong transaction được rollback. Chỉ chạy trên database local `xiangqi_dev`.

## Schema

- `public.avatars`: danh mục avatar; migration thêm bản ghi `default`.
  `asset_path` cho phép null vì bộ ảnh và UI hồ sơ thuộc bước tiếp theo.
- `public.accounts`: email, khóa email sinh bằng lowercase/trim; biệt danh hiển thị,
  khóa biệt danh sinh bằng lowercase/trim/gộp khoảng trắng; cả hai khóa đều unique.
  Có hash mật khẩu, avatar mặc định qua khóa ngoại, ngày tạo, ngày xác minh,
  hạn hồ sơ chờ 24 giờ và thời điểm đổi tên.
- `public.sessions`: khóa ngoại tài khoản, hash refresh token duy nhất, ngày tạo,
  hạn mặc định 7 ngày và thời điểm thu hồi; index theo tài khoản.
- `drizzle.__drizzle_migrations`: lịch sử do Drizzle Kit quản lý.

Migration ban đầu được sinh bằng `drizzle-kit generate`, rà soát và bổ sung
INSERT avatar mặc định trước lần áp dụng đầu. Không sửa migration đã áp dụng;
mọi thay đổi tiếp theo phải sinh migration mới. Không dùng `push`, drop hoặc reset.

Schema chỉ chuẩn bị dữ liệu. Các bước sau phải thực hiện hash mật khẩu/token,
OTP, xóa hồ sơ chờ quá hạn để giải phóng biệt danh, giới hạn đổi tên 30 ngày,
kiểm tra hạn/thu hồi phiên và giữ nguyên hạn phiên khi refresh. Giá trị mặc định
trong DB không thay thế logic nghiệp vụ này. Chưa có API đăng nhập hay UI mới.

Luồng generate → rà SQL → migrate theo [tài liệu Drizzle của NestJS](https://docs.nestjs.com/data/drizzle).
