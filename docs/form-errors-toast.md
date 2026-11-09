> Cập nhật: thông báo xác minh thành công đã chuyển khỏi LoginForm sang Toast dùng chung (success/info/error). Auth không còn banner Notice; OTP hết hạn và trạng thái cần báo cũng dùng toast, lỗi dữ liệu tại ô vẫn inline. Chỉ báo chờ không dùng banner. Quy tắc AGENTS.md đã cập nhật.
>
> Kiểm tra lượt cập nhật này: 76 unit test đạt, lint/build đạt; 13 Playwright đạt, 7 skip theo project. Hai ca registration.spec chưa hoàn tất vì test đọc hộp thư local trong khi máy đã chọn SMTP; không sửa .env hoặc dịch vụ SMTP để chạy test. Các số liệu nghiệm thu bên dưới là lịch sử của lượt trước. Ảnh mới: verified-success-toast-{1366,1440,375}.png trong thư mục form-toast.

﻿# Form: lỗi cạnh ô và toast lỗi thao tác

Áp dụng cho Đăng nhập, Đăng ký, OTP và form Tạo/Vào phòng. Quy ước chừa sẵn vùng lỗi ở lượt trước đã được thay bằng form sạch gọn. Không đổi validation nghiệp vụ, API, SMTP, OTP, session hay schema.

- Khoảng cách nhóm ô Auth 18px; lỗi trường chỉ render khi có lỗi, cách ô 5px. Card giữ chiều rộng, lỗi dài xuống dòng và cho trang cuộn tự nhiên.
- Biệt danh/email đã dùng ánh xạ từ mã backend vào đúng ô. OTP sai ở ô mã; hết hạn/khóa mã ở cạnh Gửi lại mã. Focus lỗi API đợi loading kết thúc để input đã được mở lại.
- ErrorToast dùng chung, portal ra body, không chiếm chỗ trong card. Một toast, đóng bằng bàn phím, không tự biến mất/giật focus. Desktop dưới header, góc phải. Mobile chọn vị trí tránh ô đang nhập và nút chính, cập nhật khi cuộn/focus/visualViewport thay đổi.
- Chỉ dùng thông báo an toàn theo mã đã biết; mã lạ (kể cả tên thuộc Object.prototype) dùng câu chung. Thất bại gửi email qua bước đăng ký → OTP dùng tín hiệu trong bộ nhớ browser, không chứa mã hoặc thông tin đăng nhập.
- Form phòng dùng validator đang có, lỗi ô/focus cùng quy ước và toast lỗi thao tác. Tạo phòng desktop xếp 5 phong cách trên một hàng; mobile giữ danh sách tự nhiên. Không đổi lựa chọn hoặc dữ liệu phong cách.

File giao diện: `features/auth/{login/LoginForm,registration/RegisterForm,otp/VerifyEmailForm,PasswordField}.tsx`, `auth.module.css`, `auth-feedback.ts`, phần ánh xạ an toàn trong `auth-client.ts`; `features/shared/Toast.tsx` và `toast.module.css`; `features/rooms/{RoomForm,PlayRoom}.tsx` và CSS phòng. Notice được giữ lại cho thông tin trạng thái khác.

Quy tắc: `AGENTS.md`. Test: `e2e/form-errors.spec.mjs`, locator toast trong `e2e/auth.spec.mjs`, tùy chọn thư mục ảnh trong `e2e/auth-layout.spec.mjs`; harness focus/markup trong `tests/room-ui.test.mjs` và `tests/room-theme-contract.test.mjs`.

## Số đo Đăng ký

Đơn vị px. Trước là form sạch với vùng chừa lỗi, chụp ngay trước khi đổi sang toast. Sau là form sạch hiện tại. Toast xuất hiện: độ dịch nút và thay đổi kích thước card đều bằng 0 trên cả ba viewport.

| Viewport | Rộng card | Cao card trước → sau | y nút trước → sau | Document sau |
| --- | --- | --- | --- | --- |
| 1366×768 | 440 → 440 | 644.09 → 526.09 | 613 → 495 | 768 |
| 1440×900 | 440 → 440 | 644.09 → 526.09 | 670 → 552 | 900 |
| 375×812 | 343 → 343 | 640.59 → 522.59 | 623.5 → 505.5 | 812 |

Số đo đầy đủ ba form trong `design/screenshots/form-toast/clean-before.json`, `clean-after.json`, `metrics-{1366,1440,375}.json`. Ảnh sạch trước/sau và ảnh lỗi: cùng thư mục `form-toast`. Ảnh test dùng dữ liệu giả, che trường mật khẩu/OTP khi đang có dữ liệu. Ảnh `*-toast-mobile-460.png` chụp viewport giảm chiều cao thực tế của test, không phải toàn trang.

## Kiểm tra đã chạy

- 76 test Node frontend đạt.
- Playwright toàn bộ: 15 đạt, 7 skip có chủ đích vì test chỉ thuộc desktop hoặc mobile. Gồm sạch/lỗi trường/toast ở 1366×768, 1440×900, 375×812; đóng toast bằng Enter, gửi lại không trùng, mã lạ không lộ phản hồi; OTP sai/hết hạn, gửi email lỗi; lỗi dài và viewport 375×460; tạo/vào phòng thật qua proxy; đăng ký → OTP → đăng nhập → lobby → reload → logout.
- Lint, build Next.js (có TypeScript) và git diff --check đạt.
- Tương phản chữ toast #fff0cf trên #321b10: 14.32:1.

Lần chạy hồi quy đầu gặp fixture đăng nhập không khớp dữ liệu DB; đã chạy auth:fixture dành riêng cho tài khoản test, sau đó toàn bộ luồng đạt. Không thay tài khoản người dùng.

```powershell
node --test apps/web/tests/*.test.mjs
$env:AUTH_SCREENSHOTS_DIR='../../.tmp/toast-flow'
npm.cmd run test:e2e --workspace=@xiangqi/web
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Chưa kiểm tra bàn phím ảo trên thiết bị thật, phần mềm đọc màn hình thật hoặc zoom trình duyệt trên thiết bị thật. Giảm viewport và tăng độ dài lỗi là mô phỏng khả năng đọc/thao tác; không coi là nghiệm thu thiết bị thật. Không thêm dependency, commit, push hoặc deploy.
