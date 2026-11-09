# Base backend và frontend

## Phạm vi

- Tái sử dụng bootstrap, `configureHttp`, `HttpErrorFilter`, pipe phòng,
  `DatabaseModule`/`DatabaseService` và proxy phòng hiện có.
- Middleware requestId được đăng ký trước JSON parser. Mỗi HTTP response của
  NestJS có `x-request-id`, kể cả JSON sai, 404 và lỗi nội bộ. Chấp nhận UUID v4
  hợp lệ từ phía gọi để đối chiếu qua proxy; giá trị khác được thay bằng UUID mới.
  ID chỉ dùng đối chiếu, không chứng minh danh tính hay thay thế kiểm tra quyền.
- Proxy Next.js tạo/chuyển ID tới NestJS và trả ID từ upstream, kể cả lỗi gateway.
  Lỗi do proxy phát hiện trước khi gọi NestJS cũng có ID riêng. Body/status V1,
  timeout 8 giây, whitelist dữ liệu và quy tắc không retry POST được giữ nguyên.
- `RoomRequestError` giữ `requestId` và `status` khi có HTTP response, trong khi
  thông báo đang hiển thị qua Notice vẫn giữ nguyên. Có thể xem header trong
  DevTools → Network. Lỗi mạng trước khi nhận response có thể không có ID.
- Chưa có điểm tái sử dụng thứ hai ngoài proxy phòng nên không tách framework
  proxy tổng quát. Không thêm interceptor, AuthGuard, DTO auth, dependency,
  endpoint hoặc thay đổi UI. Không thêm log request/payload; bootstrap không
  in nguyên đối tượng lỗi ra console.
- Không thay đổi schema, migration, Socket.IO, luật cờ hoặc điều hướng V1.

Quy tắc phân lớp và giữ hợp đồng được bổ sung trong `AGENTS.md`.

## Chạy kiểm tra từ thư mục gốc (PowerShell)

```powershell
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
npm.cmd run db:check --workspace=@xiangqi/server
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Backend chưa có script lint riêng. Typecheck và test hiện có được dùng để kiểm
tra backend; không cài thêm công cụ lint trong bước này.

Để smoke test thực tế, chạy backend ở cổng 3001 và frontend ở cổng 3000 như cấu
hình local hiện có, rồi chạy:

```powershell
node apps/web/scripts/verify-base.mjs
```

Script dùng Chrome hoặc Edge cài sẵn trên Windows, CDP và WebSocket của Node 22;
không cần dependency. Nó tạo profile tạm riêng, đóng trình duyệt và xóa profile
sau khi kiểm tra. Script tạo vài phòng thử trong bộ nhớ của backend, không ghi
tài khoản, không sửa DB và không can thiệp phiên trình duyệt của người dùng.

## Kết quả nghiệm thu Base

- 48 test backend và 73 test frontend đạt; frontend lint, backend typecheck và
  build cả hai ứng dụng đạt.
- `db:check`: SELECT 1 = 1, database `xiangqi_dev`, role `xiangqi_app`; ba bảng
  nền và một bản ghi lịch sử migration vẫn giữ nguyên.
- HTTP thực tế: `/health` 200; proxy tạo phòng 201, vào phòng 200, phòng đầy 409.
  Body lỗi phòng đầy, status và requestId khớp khi đối chiếu với NestJS trực tiếp.
- Chrome headless: tạo/vào phòng bằng hai browser context riêng, Socket.IO
  đồng bộ bàn 90 giao điểm; local đi Tốt rồi chuyển lượt Đen; cổng Khai cuộc tải được.
- Chưa kiểm thử thủ công mọi kích thước màn hình hoặc toàn bộ thao tác trong
  trận bằng trình duyệt. Các test hồi quy hiện có vẫn kiểm tra luật, timeout,
  reconnect, đầu hàng, trang development và hợp đồng UI.

Cách gắn middleware và header dựa trên API hiện có của
[NestJS](https://docs.nestjs.com/middleware) và
[Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).
