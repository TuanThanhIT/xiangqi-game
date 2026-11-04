# Năm phong cách miễn phí — quy chuẩn và nghiệm thu

Phạm vi đã duyệt: earth, meadow, ink, bamboo, snow. Người tạo chọn một lần;
server lưu cho phòng, người vào/reconnect nhận cùng theme. Không có mua/mở khóa.
Menu giữ nhận diện chung; local mặc định earth. Theme không thuộc luật cờ.

## Quy chuẩn mỹ thuật

| ID / tên | Nền và chi tiết viền | Mặt bàn / sông | Khung | Nền panel / chữ / điểm nhấn |
|---|---|---|---|---|
| earth — Đất cát | Đất vàng tự nhiên, đá/cát nhỏ ngoài vùng chơi | Đất vàng `#E8D2A8` / ngọc `#89B9A3` | Gỗ nâu, đồng | `#30261D` / `#F5E9D0` / `#E0BD83` |
| meadow — Thảo nguyên | Cỏ xanh dịu, đất mòn, suối; không neon | Cỏ/đất nhạt `#DCE3BA` / suối `#91BCA8` | Gỗ ấm | `#233326` / `#F1EFD9` / `#D2D59C` |
| ink — Thủy mặc | Giấy ngà, núi mực chủ yếu ở viền | Giấy `#F0E7D1` / ngọc `#A0C1B1` | Gỗ thanh | Panel ngà `#F2E9D5` / chữ mực `#292A25` / `#655037` |
| bamboo — Trúc lâm | Rừng trúc, lá/mắt tre ở viền | Tre/đất sáng `#DEE0B4` / ngọc `#8DBBA4` | Tre | `#203A2E` / `#F0EAD0` / `#D4DA9D` |
| snow — Tuyết sơn | Núi tuyết, đá, sương; vùng trung tâm tĩnh | Tuyết ngà `#E7EDF0` / băng `#A8CED8` | Đá/bạc | `#293B48` / `#EDF2F1` / `#D0E0E7` |

Màu là đầu vào cần đo tương phản khi áp dụng. Quân nền ngà; Đỏ đỏ son,
Đen đen, cả hai hai vòng liền. Lưới/dấu tối trên bàn sáng. Cảnh báo, lỗi và focus
theo vai trò riêng, không dùng màu của phe để diễn giải trạng thái.

## Asset cần và cách tách lớp

Mỗi theme cần các lớp sau; không được có lưới, quân, chữ, nút trong ảnh:

| Lớp | Yêu cầu kích thước/tỉ lệ | Dùng ở đâu / giới hạn |
|---|---|---|
| `page-bg` | 1920×1080 hoặc 2048×1152, 16:9 | Phong cảnh bao trang, chi tiết ở viền; chừa giữa ít nhiễu, crop được sang mobile |
| `ground` | 1024×1024, 1:1, tile kín mép | Texture đất/cỏ/giấy/tre/đá nhạt trên hai bờ; không làm chìm lưới |
| `water` | SVG pattern tĩnh hoặc ảnh tile 1024×256, 4:1 | Sông theo vùng tọa độ cũ; không hoạt ảnh liên tục |
| `frame` | CSS/SVG; nếu cần ảnh: tile 1024×128, 8:1 | Vân gỗ/tre/đá, góc/viền riêng; không thay viewBox hoặc hit area |
| `preview` | 320×180, 16:9 | Bản nhỏ thể hiện phong cảnh + vật liệu, không chỉ ô màu; không tải nền lớn của cả năm theme |

Ưu tiên SVG/CSS cho lưới/cung, sóng, khung, bóng quân, trạng thái và focus.
Ảnh cần cho phong cảnh/texture tự nhiên; không coi gradient là mỹ thuật hoàn chỉnh.
Đề xuất WebP: nền ≤400 KB/theme, tile ≤150 KB/theme, preview ≤35 KB/theme;
giới hạn được kiểm tra trên file thực tế. Nguồn gốc có thể giữ riêng bản PNG gốc;
frontend chỉ tải bản tối ưu của theme đang dùng. Có màu fallback mỗi lớp.

## Công cụ và nguồn

- Có `image_gen` tích hợp để tạo lớp ảnh sạch, không cần thêm dependency/skill.
- Concept người dùng cung cấp: [A–C](docs/design/concepts/themes-abc-fullpage.png)
  và [D–E](docs/design/concepts/themes-de-fullpage.png). Chỉ tham khảo, không dùng
  nguyên ảnh làm nền trang/bàn.
- Mười ảnh sạch được tạo bằng image_gen; tối ưu bằng sharp đã có trong repository.
  [Nguồn và thông số asset](apps/web/public/themes/README.md), manifest ASSETS.json.
- Có Chrome headless trên máy: đã chụp giao diện thật bằng profile kiểm tra riêng,
  không dùng profile người dùng, không cài browser/framework mới.

## Hợp đồng

- `POST /rooms`: `{ nickname, themeId? }`; không có themeId → earth.
- `POST /rooms/:code/join`: chỉ `{ nickname }`; không được ghi đè theme.
- Chỉ năm ID cố định; từ chối URL, path, object, CSS hoặc ID khác.
- Response cấp ghế vẫn chỉ gồm credentials và thông tin ghế hiện có;
  `room:state` bổ sung `themeId`. Client chưa nhận snapshot phòng hợp lệ thì dùng
  nền trung tính, chưa mở tương tác. Không lấy theme từ localStorage.
- `game:state`, revision, quyền token/socket, timeout, pending/retry không đổi.

## Cách bổ sung sau này

Thêm ID vào allowlist có test backend/web, thêm một mục catalog asset/token,
thêm palette scoped `[data-theme]` và preview. Không sao chép component hoặc
toàn stylesheet; không đưa metadata theme vào `@xiangqi/rules`.

## Nghiệm thu và phần chưa kiểm chứng

1. Backend: mặc định/ID sai, tạo-join-reconnect giữ theme, hai phòng cách ly,
   metadata không tăng game revision, không chứa secret trong snapshot.
2. Bộ chọn: radio keyboard/chuột/chạm, dấu chọn có hình/chữ, loading/submit lock.
3. Kiểm tra năm theme desktop và 375px, zoom 200%, tên dài, bàn phím,
   reduced motion và nhiều dấu cùng vị trí; đo tương phản từng nền.
4. Hồi quy local/reset/dev, online/reload/tiếp tục, thay tab/pending/retry,
   đầu hàng/timeout/hủy và điều hướng sau trận.
5. So sánh screenshot 5 theme desktop và ít nhất một theme 375px với concept:
   bảng màu, vật liệu, vị trí chi tiết viền, độ tĩnh vùng chơi và độ đọc của quân.
   Không tuyên bố giống concept khi chưa có ảnh tham chiếu và screenshot.

## Đối chiếu hình ảnh thực tế

Đã mở và so sánh hai concept với năm screenshot desktop 1440px:
[Đất cát](docs/design/screenshots/earth-desktop.png),
[Thảo nguyên](docs/design/screenshots/meadow-desktop.png),
[Thủy mặc](docs/design/screenshots/ink-desktop.png),
[Trúc lâm](docs/design/screenshots/bamboo-desktop.png),
[Tuyết sơn](docs/design/screenshots/snow-desktop.png).
[Trúc lâm 375px](docs/design/screenshots/bamboo-mobile-375.png) không tràn ngang.

- Giữ tông đất vàng/gỗ đồng, đồng cỏ xanh dịu, giấy ngà/mực, trúc xanh,
  núi tuyết/xanh đá; nền sáng của Thủy mặc được giữ cả trên panel.
- Phong cảnh được vẽ riêng: Đất cát tĩnh hơn chiến địa trong concept; Tuyết sơn
  có cành hoa ở viền. Không sao chép đúng từng vật thể của concept.
- Khung giản lược bằng SVG để giữ tọa độ và vùng bấm; không có avatar, chữ sông
  hoặc nút giả trong concept. Sông có sóng tĩnh, mặt bàn có texture nhẹ.
- Panel đặc màu giúp đọc chữ trên nền ảnh. Màu danger của Tuyết sơn được nâng sáng
  để đạt tương phản; màu/border/hover Thủy mặc đổi theo nền sáng.

Đã kiểm tra tự động 38 cặp màu/theme: chữ ≥4,5:1; dấu/viền/focus ≥3:1.
Đo thêm mọi pixel của năm texture sau khi phối opacity 0,22 lên nền bàn:
lưới tối thiểu 5,65:1; focus 4,25:1; lastMove 4,83:1. Đây là phép đo lớp màu,
không thay thế nghiệm thu nét chống răng cưa/font trên từng thiết bị.
Đã thử Chrome thật: tạo năm phòng, theme từ server, kết nối người thứ hai,
reload rồi tiếp tục giữ theme, hủy xác nhận đầu hàng, nhận kết quả và về menu;
local vẫn earth. Đã thử thêm radio bằng phím mũi tên, năm theme 375px,
đi quân bằng bàn phím, ăn quân và reload giữ nguyên bàn. Test backend 47, frontend 58, rules 99 đều đạt; lint/build và
typecheck backend đạt. Các ca timeout/retry được kiểm tra bằng test, chưa chờ
60 giây thực trên trình duyệt trong lượt nghiệm thu theme.

Cần người dùng duyệt mỹ thuật trên thiết bị thật, đặc biệt font Hán trên điện
thoại, zoom 200%, thao tác chạm và phối hợp dấu chọn/lastMove/focus. Screenshot
development có chỉ báo Next.js; chỉ báo đó không phải asset hoặc UI production.
