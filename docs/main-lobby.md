# Sảnh chính và nền vào game

`/lobby` dùng bố cục theo `design/03-main-lobby.png` mới: tiêu đề giữa với hai đường đồng, ba chế độ chia đều toàn chiều ngang, grid 65/35 tối đa 1280px. Cột trái là thẻ Giải trí với `/lobby/hero.png`; cột phải Phòng chơi ở trên, Bạn bè thấp hơn ở dưới. Hai cột thẳng mép trên/dưới. Thanh tiện ích có đúng 5 mục, không còn badge độc lập phía trên.

## Hành vi được giữ

- Tạo phòng → `/play?mode=create`; Vào bằng mã → `/play?mode=join`; Chơi cùng thiết bị → `/local`.
- Có phiên V1 lưu hợp lệ: Tiếp tục trận là nút chính → `/play`, còn Tạo phòng là link phụ ở đầu thẻ Phòng chơi. V1 chỉ xác thực ghế và kết nối sau nút Tiếp tục phòng hiện có.
- Menu tài khoản, kiểm tra phiên, lỗi mạng/thử lại và logout dùng nguyên logic hiện có. Sảnh không ghi/xóa storage và không mở socket chỉ để hiển thị.
- Xếp hạng/Hướng dẫn là tab disabled có badge Sắp ra mắt, không có route giả. Top 50 chưa triển khai. Bạn bè và 5 tiện ích giữ trạng thái chờ mở, không dữ liệu giả/số dư.

## Nền và responsive

`features/shared/entry-background.module.css` chỉ đặt thuộc tính background: ảnh `/images/entry-background.png`, cover, giữ tỷ lệ, căn giữa và lớp phủ tối nhẹ. Mobile căn 56% để ưu tiên mặt hồ ít chi tiết. Class này dùng cho Cổng game, Sảnh, Đăng nhập và Đăng ký; không tạo chiều cao bổ sung.

Ở Cổng game và hai form chỉ thay lớp nền; ảnh minh họa riêng, bố cục, validation và hành vi giữ nguyên. AuthShell có tùy chọn nền để OTP vẫn giữ nền cũ. Trong trận giữ cơ chế theme V1; đã mở một trận Trúc lâm thật để đối chiếu.

Desktop thấp: giảm chiều cao hero theo viewport, giữ tỷ lệ ảnh bằng object-fit:cover/object-position 50% 65%, ưu tiên quân tiền cảnh và sông. Không giấu overflow trang. Cột phải chia chiều cao 60/40 để Bạn bè thấp hơn Phòng chơi, tổng bằng thẻ trái. Không thêm họa tiết minh họa mới vào các thẻ.

Mobile: tiêu đề → chế độ → Phòng chơi → Giải trí → Bạn bè → tiện ích. Nút xếp dọc, badge tab được xuống hàng, Bạn bè cao theo nội dung và tiện ích chia 2 cột. Các thay đổi này khác cách xếp desktop để nút chơi xuất hiện sớm và không cắt chữ.

## File thêm/sửa trong đợt này

- `apps/web/src/components/MainMenu.tsx`: gắn class nền, giữ nội dung/luồng cổng.
- `apps/web/src/features/shared/entry-background.module.css`: lớp nền dùng chung.
- `apps/web/src/features/auth/AuthShell.tsx`: chọn nền; `apps/web/src/app/verify-email/page.tsx`: giữ nền OTP.
- `apps/web/src/features/lobby/Lobby.tsx`, `LobbyIcon.tsx`, `ModeTabs.tsx`, `lobby.module.css`: cấu trúc và hình thức sảnh.
- `apps/web/e2e/lobby.spec.mjs`: đo scrollingElement, normal/resume ở 4 viewport, vị trí thẻ, tab, 5 tiện ích, menu, điều hướng và phòng thật.
- `apps/web/e2e/entry-background.spec.mjs`: ảnh nền tải trên 4 màn, OTP không bị đổi và trận bamboo giữ nền riêng.
- Tài liệu này cùng ảnh/số đo ở `design/screenshots/lobby-blue/`.

Asset ảnh do người dùng cung cấp được dùng nguyên trạng. Không sửa backend, API, schema, Auth/OTP, SMTP hoặc Socket.IO. Không thêm dependency, commit, push hoặc deploy.

## Kết quả thực tế

| Viewport | scrollHeight / clientHeight, thường | Có phiên phòng | scrollWidth |
| --- | --- | --- | --- |
| 1920×1080 | 1080 / 1080 | 1080 / 1080 | 1920 |
| 1600×900 | 900 / 900 | 900 / 900 | 1600 |
| 1366×768 | 768 / 768 | 768 / 768 | 1366 |
| 375×812 | 1140 / 812 | 1146 / 812 | 375 |

Desktop scrollY=0; nút chơi và thanh tiện ích nằm trọn trong viewport, hai cột bằng tổng chiều cao. Mobile cuộn tự nhiên, không tràn ngang. Số đo lấy từ document.scrollingElement, không cuộn trước khi đo.

- 77 test Node frontend đạt.
- Toàn bộ Playwright: 29 đạt, 17 bỏ qua có chủ đích: 15 theo project/phạm vi viewport; 2 ca đăng ký đòi hộp thư local khi máy đang dùng SMTP thật. Không tự đổi cấu hình gửi mail để chạy test.
- Đã thử menu bàn phím, avatar hỏng/dự phòng, tên dài, normal/resume, các link V1, phòng thật, đăng nhập/reload/logout và lỗi mạng/toast.
- Đã kiểm tra ảnh hồ sen decode thành công trên bốn màn ở desktop/mobile. Một trận thật theme bamboo có bàn 90 giao điểm và giữ `/themes/bamboo/page-bg.webp`.
- Lint, TypeScript noEmit, production build và git diff --check đạt.

Ảnh yêu cầu: `lobby-1600x900.png`, `lobby-1366x768.png`, `lobby-375x812.png`. Có thêm 1920×1080, ảnh resume, `entry-{portal,lobby,login,register}-{desktop,mobile}.png`, ảnh tên dài và `match-bamboo-background.png`. Cùng thư mục có `metrics-{1920,1600,1366,375}.json`. Ảnh dùng dữ liệu test, không có mật khẩu/OTP/token.

```powershell
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd exec --workspace=@xiangqi/web -- tsc --noEmit --incremental false
$env:AUTH_SCREENSHOTS_DIR='../../.tmp/lobby-blue-flow'
npm.cmd run test:e2e --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Chưa nghiệm thu thiết bị mobile/phần mềm đọc màn hình thật. Các chế độ và tiện ích Sắp ra mắt vẫn chưa triển khai theo phạm vi.
