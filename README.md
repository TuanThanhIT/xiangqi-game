# Web cờ tướng

Dự án web cờ tướng để vừa học lập trình vừa triển khai thực tế, tổ chức trong một repository bằng npm workspaces.

## Trạng thái hiện tại

Frontend Next.js đã được khởi tạo với TypeScript, App Router, thư mục `src`, ESLint và CSS thông thường. Trang chủ chỉ hiển thị giới thiệu và trạng thái phát triển, chưa có chức năng chơi cờ.

Backend NestJS và bộ luật TypeScript chưa triển khai; hai workspace này hiện chỉ có `package.json` tối thiểu.

## Cài đặt và chạy frontend

Yêu cầu Node.js từ 20.9 trở lên cho Next.js 16.4.3. Máy hiện tại dùng Node.js v22.17.0. Xem [tài liệu cài đặt Next.js](https://nextjs.org/docs/app/getting-started/installation).

Chạy tại thư mục gốc repository trên Windows:

```powershell
npm.cmd install
npm.cmd run dev:web
```

Mở `http://localhost:3000` (hoặc cổng được terminal thông báo). Nhấn `Ctrl+C` để dừng server.

Dự án dùng một `package-lock.json` tại gốc. Không cài dependency riêng trong `apps/web`.

Kiểm tra frontend từ thư mục gốc:

```powershell
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
```

Lệnh `dev:web` ở gốc gọi script `dev` của workspace `@xiangqi/web`, chạy `next dev`. App Router dùng `apps/web/src/app/layout.tsx` làm khung trang và `apps/web/src/app/page.tsx` làm nội dung trang chủ. File `globals.css` chứa CSS chung; alias `@/*` trỏ tới `apps/web/src/*`.

## Cấu trúc và vai trò

- `apps/web` (`@xiangqi/web`): frontend Next.js, giao diện chơi trên máy tính và điện thoại.
- `apps/server` (`@xiangqi/server`): backend NestJS, quản lý phòng, lưu trạng thái trận và xác thực nước đi.
- `packages/rules` (`@xiangqi/rules`): bộ luật và kiểu dữ liệu TypeScript dùng chung cho frontend và backend. Backend luôn xác thực nước đi và quyết định tính hợp lệ.

`package.json` gốc khai báo các workspace; mỗi workspace có `package.json` riêng. Dự án dùng npm workspaces, chưa dùng Nx hoặc Turborepo.

## Phạm vi V1

- Web chơi được trên máy tính và điện thoại.
- Người chơi nhập biệt danh, tạo phòng hoặc vào phòng bằng mã.
- Mỗi trận có hai người chơi; chưa có bot, xếp hạng hoặc đồng hồ.
- Chưa có tài khoản hoặc database.
- Không có tiền, cửa hàng, nâng cấp hoặc nạp tiền trong V1.
- Server lưu trạng thái phòng và trận trong bộ nhớ; khởi động lại server sẽ mất phòng và trận đang lưu.
- Bàn cờ dùng ký hiệu trước; nhân vật 2D sẽ được bổ sung sau.
- Bản thử chưa hỗ trợ luật lặp thế, chiếu dai/đuổi dai.

## Kiểm tra workspace

Trên máy Windows hiện tại, dùng `npm.cmd` để tránh lỗi PowerShell chặn `npm.ps1`.

Chạy lệnh chỉ đọc sau tại thư mục gốc để xem tên các workspace:

```powershell
npm.cmd pkg get name --workspaces
```

Lệnh này chỉ kiểm tra khai báo workspace, không cài package và không chạy ứng dụng.
