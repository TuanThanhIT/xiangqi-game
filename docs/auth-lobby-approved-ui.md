# Giao diện Auth và Sảnh — nghiệm thu 2026-11-06

## Thay đổi

- `apps/web/src/features/auth/AuthShell.tsx`: khung chung 48/52, ảnh riêng theo màn hình, nền hồ sen cho cả OTP. Import ảnh tĩnh để Next.js tạo URL theo nội dung, tránh cache ảnh cũ khi thay asset.
- `apps/web/src/features/auth/auth.module.css`: khung rộng tối đa 960px, header 64px desktop / 56px mobile, viền đồng và nền gỗ; banner mobile 120px (80px ở viewport thấp). Giữ form giãn tự nhiên, bổ sung scroll-margin cho focus.
- `apps/web/src/app/register/page.tsx`, `apps/web/src/app/verify-email/page.tsx`: chọn biến thể ảnh của khung chung.
- `apps/web/public/auth/login.png`, `apps/web/public/auth/otp.png`: đổi chỗ hai asset vốn bị ngược chủ thể; giữ nguyên nội dung ảnh. Login hiện quân Soái, OTP hiện phong thư; register giữ hộp cờ.
- `apps/web/src/features/lobby/Lobby.tsx`, `lobby.module.css`: tab nằm trong thẻ chế độ, ảnh và các nút chơi cùng thẻ; Bạn bè là thẻ thấp bên phải. Giữ đúng năm tiện ích và các link V1. Mobile xếp chế độ → Bạn bè → tiện ích.
- `apps/web/e2e/auth-approved.spec.mjs`: fixture luồng đăng ký → OTP → đăng nhập → sảnh, dán mã qua clipboard, gửi lại, số đo và ảnh.
- `apps/web/e2e/lobby.spec.mjs`, `entry-background.spec.mjs`: cập nhật kiểm tra cấu trúc Sảnh và nền OTP.
- Ảnh và số đo cuối: `docs/design/screenshots/auth-lobby-approved/`. Bộ hồi quy cũng cập nhật ảnh trong các thư mục kiểm thử hiện có.

Không sửa API, validation, session, SMTP, DB hoặc luồng phòng. Không thêm dependency.

## Kết quả

| Màn hình | Desktop 1366×768: document / viewport | Mobile 375×812: document / viewport |
| --- | --- | --- |
| Đăng nhập | 768 / 768 | 812 / 812 |
| Đăng ký | 768 / 768 | 812 / 812 |
| OTP | 768 / 768 | 812 / 812 |
| Sảnh, có và chưa có trận | 768 / 768 | 923 / 812 |

Không tràn ngang; desktop đo trước khi cuộn, thanh tiện ích nằm trọn viewport. Sảnh còn đạt ở 1600×900 và 1920×1080; Auth đạt thêm 1440×900. Mobile cho cuộn tự nhiên, đã thử focus/lỗi dài ở chiều cao 460px (mô phỏng vùng nhìn khi bàn phím mở, chưa thử bàn phím thiết bị thật).

- Playwright toàn bộ: **31 passed, 17 skipped**. Trong đó 15 ca bỏ qua do phân chia project/viewport; 2 ca đăng ký mailbox local bỏ qua vì cấu hình đang là SMTP thật.
- Sau khi chuyển sang import ảnh tĩnh, chạy lại `auth-approved.spec.mjs`: **2 passed**, ảnh cuối đã được mở để kiểm tra.
- Unit frontend: **77 passed**.
- Lint, TypeScript, Next.js production build và `git diff --check`: đạt. Git chỉ cảnh báo chuẩn hóa LF/CRLF ở các thay đổi có sẵn.
- Hồi quy đăng nhập thật → sảnh → reload → logout đạt; lỗi trường, lỗi API/toast, OTP sai/hết hạn/gửi thất bại đạt qua phản hồi giả lập.
- Đăng ký → OTP → đăng nhập → sảnh đợt này dùng fixture API; không xác nhận gửi/nhận email thật.
- Tạo phòng → `/play?mode=create`; Vào bằng mã → `/play?mode=join`; Chơi cùng thiết bị → `/local`; Tiếp tục trận → `/play`, chỉ xác thực socket sau thao tác tiếp tục trong V1. Đã kiểm tra phòng thật và nền trận bamboo giữ nguyên.

## Khác biệt có chủ đích so với ảnh mẫu

Mẫu `03-main-lobby.png` trong repo vẫn có thẻ Phòng chơi riêng. Theo yêu cầu mới, các thao tác được đưa vào chân thẻ Giải trí, Bạn bè thấp và để lộ nền bên dưới. Trên laptop giảm chiều cao ảnh trước; mobile dùng banner Auth thấp và cho Sảnh cuộn. Giữ logo 象棋, font và nút của dự án thay vì sao chép hoa văn chữ/nút raster trong mockup. Ảnh Auth dùng đúng chủ thể được yêu cầu trong nội dung, dù hình tổng hợp 02 phân bổ chủ thể khác.

## Lệnh chạy lại tại repo

```powershell
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd exec --workspace=@xiangqi/web -- tsc --noEmit --incremental false
node --test apps/web/tests/*.test.mjs
npm.cmd run test:e2e --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Playwright cần frontend ở cổng 3000 và backend ở 3001 cùng fixture Auth hiện có. Các bài fixture mới không gửi mail hoặc tạo tài khoản DB.

Ảnh cuối: `login-desktop.png`, `register-desktop.png`, `otp-desktop.png`, `lobby-1366x768.png` và các bản `login-mobile.png`, `register-mobile.png`, `otp-mobile.png`, `lobby-375x812.png` trong thư mục nghiệm thu nêu trên. Không chụp mật khẩu hoặc OTP đã điền.
