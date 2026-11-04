# Thiết kế giao diện Xiangqi Game V1

Quy chuẩn năm phong cách miễn phí, danh sách asset và tiêu chí so sánh concept:
[THEMES.md](./THEMES.md).

Đợt hoàn thiện trận đấu 2.5D đã được duyệt sau hướng ban đầu: quy tắc bố cục
viewport và dấu tròn mới được ghi tại [kiểm chứng màn hình trận](docs/design/COMPACT.md).
Các quy tắc mới này thay thế đề xuất khung vuông/khung nét đứt và bố cục cuộn
thường trực ở các mục dưới; không thay đổi logic hoặc quyền tương tác.

Layout trận online mới nhất: **không header ngang, không sidebar**; bảng gỗ treo
232×110px góc trái khi đủ chỗ. Hai thanh Đen/Đỏ cao36px, gap4px, cùng rộng với bàn.
Desktop dùng `Hboard = 100dvh - 96px`. Thiếu không gian thì bảng treo chuyển thành
hàng phòng gọn, tính thêm hàng phòng/hành động vào ngân sách bàn. Thông báo/kết quả
nằm cạnh bàn trên desktop, trong vùng an toàn trên mobile. Chi tiết/số đo
ở phần đầu COMPACT.md; các đề xuất sidebar cũ bên dưới không còn áp dụng online.

Pill active dùng HTML “ĐẾN LƯỢT” NFC, font Arial/system-ui, line-height1,3,
không letter-spacing/transform; vẫn dùng điều kiện playing/synced/playEnabled.

Khay quân bị ăn đã duyệt: khay gỗ dọc Đen trái/nửa trên, Đỏ phải/nửa dưới,
rộng104px, gap14px, không thu nhỏ bàn. Viewport thiếu chỗ dùng badge phe/số
mở popover native. Nội dung suy ra theo ID khai cuộc chuẩn từ pieces đã xác nhận,
không theo phe người ăn, không phải thứ tự ăn; loại Tướng, tối đa15 quân mỗi khay.
Fixture rút gọn ẩn khay. Huy hiệu BẠN riêng viền đồng thay “· Bạn” trên thanh tên,
chỉ theo identity đã xác thực. Bản hiện tại khay tĩnh, chưa có hiệu ứng bay quân.

> **Đã duyệt hướng thiết kế; thông số cần kiểm chứng khi triển khai.** Đợt đầu chỉ chuẩn hóa token, kiểu Button/ActionLink, panel và menu; các màn hình khác chưa áp dụng.

## 1. Cơ sở và mục tiêu

- Cổ trang hiện đại: nền tối, đỏ son/vàng đồng, bố cục gọn; bàn sáng và quân dễ đọc là trọng tâm. Trang trí bằng CSS/SVG tiết chế, không dùng emoji làm hệ thống icon.
- Đã khảo sát `globals.css`, `main-menu.module.css`, `play-room.module.css`, `MainMenu`, `RoomForm`, `RoomLobby`, `PlayRoom`, `OfflineDeadline`, `OnlineBoard`, `XiangqiBoard` và `BoardView`.
- Hiện menu đã tối; nền chung và phòng còn kem; nút, viền và thông báo chưa thống nhất. Local/online đã dùng chung `BoardView`; giữ nguyên cách chia logic này.
- Skill `ui-ux-pro-max` đã được nhận diện trong phiên Codex. Dùng hướng dẫn web và kết quả tra cứu focus/lỗi form. Kết quả sinh thiết kế trước đó không khớp bảng màu/phong cách; không dùng màu, font ngoài hoặc 3D từ kết quả đó.
- CSS thường và font hệ thống; không đổi luật, API, socket, phiên/pending/retry hoặc quyền tương tác. Chưa thiết kế nhân vật, skin, hoạt ảnh chiến đấu hay thêm gợi ý nước đi.

## 2. Màu đề xuất

CSS variables dùng prefix `--xq-`, lớp dùng chung có prefix `xq-` để tránh xung đột. Token đã được dùng ở menu; bảng màu bàn và các màn hình khác vẫn là hướng triển khai sau.

| Vai trò | Màu | Cách dùng |
|---|---|---|
| `background` | `#141615` | Nền trang |
| `surface` / `surface-raised` | `#202320` / `#292B26` | Panel / input, nút phụ |
| `text` / `text-muted` | `#F3E6CD` / `#C8BAA4` | Chữ chính / mô tả trên nền tối |
| `primary` / `primary-hover` | `#A4392B` / `#B13D2E` | Nút chính; hover giảm sáng so với đề xuất `#BB4332` (chữ ngà chỉ 4,29:1) để đạt ít nhất 4,5:1 |
| `accent` | `#DFB875` | Tiêu đề phụ, mã phòng, điểm nhấn vàng đồng |
| `border-control` / `divider` | `#9D835F` / `#61503C` | Biên input/nút / đường chia trang trí |
| `danger-text` | `#F2A294` | Lỗi, nhãn hành động nguy hiểm trên nền tối |
| `success-text` | `#A8CCA4` | Trạng thái online, xác nhận thành công; luôn kèm chữ |
| `focus-dark` | `#F3CF88` | Outline trên nền tối |
| `board` / `piece` | `#EFDAB1` / `#FFF8E9` | Mặt bàn / nền quân, giữ bảng sáng hiện có |
| `board-line` / `board-ink` | `#80623D` / `#29251F` | Đường bàn / chữ, dấu chọn trên bàn |
| `side-red` / `side-black` | `#A52121` / `#262626` | Quân Đỏ / Đen; chữ Hán riêng, cùng viền kép liền |
| `board-focus` / `board-last-move` | `#1E4F7B` / `#6B4A1E` | Focus xanh được làm đậm để rõ trên nước / nước vừa đi màu đồng đậm |

### Trạng thái Button/ActionLink

| Biến thể | Mặc định | Hover / pressed | Focus | Disabled |
|---|---|---|---|---|
| Primary | Nền `#A4392B`, chữ ngà, viền vàng sáng `#F3CF88` | Nền `#B13D2E` / `#923025`, giữ chữ và viền | Giữ màu trạng thái + outline vàng `#F3CF88`, 3px, offset 3px | Nền `#4A302A`, chữ `#C8BAA4`, viền `#9D835F` nét đứt |
| Secondary | Nền `#292B26`, chữ ngà, viền `#9D835F` | Nền `#493C2D` / `#373024`, hover viền vàng đồng | Cùng outline vàng, không biến thành primary | Nền `#242723`, chữ `#C8BAA4`, viền nét đứt |
| Danger | Nền `#202320`, chữ/viền đỏ nhạt `#F2A294` | Nền `#422822` / `#522C25`, giữ chữ/viền | Cùng outline vàng, vẫn giữ nhãn nguy hiểm | Nền `#292222`, chữ `#C8BAA4`, viền `#875F57` nét đứt |

Disabled không nhận hover/pressed, opacity 1, cursor `not-allowed`; button dùng `disabled` thật. ActionLink giữ nguyên Next.js Link; menu hiện không có link disabled. Nếu cần ở đợt sau, không chỉ dựa vào CSS/pointer-events để chặn link. Danger được định kiểu để dùng chung sau, chưa áp dụng vào nút đầu hàng trong đợt đầu.

Viền primary sáng hơn màu accent để đạt 3:1 cả phía trong nền nút hover. Focus cách viền 3px để không trùng nhau. Mọi con số tương phản phải tính từ màu CSS cuối cùng; vẫn cần kiểm tra hiển thị bằng trình duyệt.

Chữ thường cần tương phản ít nhất 4,5:1; dấu focus và biên điều khiển có ý nghĩa cần 3:1 với nền kề. Đo lại từng cặp thực tế khi triển khai, gồm hover và nền gradient. Không dùng `divider` làm biên duy nhất của input hoặc chữ nhạt trên mặt bàn. Không phân biệt phe, lỗi hay kết quả chỉ bằng màu.

## 3. Chữ và kích thước

- Tiêu đề: `Georgia, "Times New Roman", serif`; nội dung/nút/input: `Arial, Helvetica, sans-serif`. Không tải font ngoài.
- Nội dung và điều khiển: 16px, line-height 1,5–1,6; mô tả/nhãn trạng thái: 14px; label 16px, đậm 600–700.
- H1 trang: 28–36px; riêng thương hiệu menu 40–72px co giãn. H2: 24px; H3: 20px; tiêu đề line-height 1,2–1,3, không bỏ cấp heading chỉ để lấy cỡ chữ.
- Mã phòng dùng font monospace hệ thống, 24–32px, vẫn chọn và sao chép được. Tên dài phải xuống dòng.
- Chữ Hán trên quân dùng 30 đơn vị SVG, font KaiTi/STKaiti và fallback CJK hệ thống. Không áp quy tắc 16 CSS px một cách máy móc vào SVG; giữ tên truy cập tiếng Việt đầy đủ.

## 4. Khoảng cách và hình khối

- Thang: 4 / 8 / 12 / 16 / 24 / 32 / 48px. Label–input 8px; giữa field 16px; giữa nhóm 24px; giữa khu vực 32px.
- Lề mobile 16px; desktop 24–32px. Panel padding 16px trên mobile, 24px khi rộng.
- Bo góc: input/nút 4px, panel 8px. Vòng tròn chỉ dành cho quân và dấu có ý nghĩa; không biến mọi panel thành thẻ lồng nhau.
- Viền điều khiển 1px; focus 3px, offset 3px. Shadow nhẹ cho panel chính; không thêm kính mờ, texture hoặc hiệu ứng 3D.

## 5. Điều khiển và phản hồi

| Thành phần | Quy ước |
|---|---|
| Primary | Nền đỏ son, chữ ngà; một hành động nổi bật mỗi nhóm: tạo/vào/tiếp tục. Không để nhiều nút cùng tranh ưu tiên. |
| Secondary | Nền `surface-raised`, viền `border-control`, chữ ngà; sao chép mã, về menu, hành động phụ. Link điều hướng vẫn là link. |
| Danger | Nền tối, viền/chữ `danger-text`, nhãn rõ “Đầu hàng”; không chỉ dùng màu đỏ giống primary. Giữ xác nhận hiện có. |
| Input | Cao ít nhất 48px, width 100%, label luôn hiện; nền tối, chữ ngà, viền rõ. Lỗi đặt cạnh field nếu xác định được, nối bằng `aria-describedby`; không đổi hợp đồng validation. |
| Panel | Nền `surface`, viền nhẹ, H2 và nội dung theo một trục; bản thân panel không tự có role tương tác. |
| Loading | Chữ “Đang…” mô tả việc đang làm, giữ kích thước nút ổn định, khóa đúng quyền hiện tại; không tự retry POST hoặc tạo skeleton giả bàn. |
| Thông báo | Thông tin trung tính, cảnh báo vàng đồng, lỗi đỏ nhạt; có nhãn/nội dung, không chỉ icon. Lỗi thao tác dùng `role="alert"`, cập nhật trạng thái dùng `role="status"` phù hợp. |

- Hover/pressed đổi màu hoặc viền, không dịch chuyển bố cục; chuyển màu khoảng 120–180ms. Không cần hover để hiểu hoặc dùng chức năng.
- `:focus-visible` rõ trên mọi điều khiển; không bị panel cố định che, không xóa outline khi chưa có dấu thay thế.
- Disabled dùng thuộc tính đúng ngữ nghĩa, màu giảm nhấn nhưng còn đọc được; cursor không cho thao tác. Chỉ trạng thái thật đang xử lý mới dùng cursor chờ; nhãn “Sắp ra mắt” không có hành động.
- Với `prefers-reduced-motion: reduce`, bỏ chuyển động trang trí/transform và transition không cần thiết; trạng thái, focus và đếm ngược vẫn rõ. Không thêm hiệu ứng nhấp nháy hoặc hoạt ảnh ăn quân.
- Không dời focus theo từng giây đếm ngược; hướng triển khai cần tránh screen reader đọc lại cả banner mỗi giây. Chỉ thông báo các chuyển trạng thái có ý nghĩa, không thay quy tắc deadline server.

## 6. Bố cục và trạng thái từng màn hình

- **Mobile từ 375px:** một cột, nội dung không tràn ngang; nút form rộng, cao ít nhất 48px, cách nhau ít nhất 8px. Cho cuộn dọc tự nhiên; không ép cả bàn và thông báo vào một màn hình.
- **Desktop:** menu rộng tối đa 1120px, hai cột từ khoảng 768px; form/khôi phục phiên tối đa 480px. Bàn giữ chiều rộng tối đa khoảng 608px; từ khoảng 1024px có thể đặt thông tin phòng cạnh bàn, nếu còn đủ chỗ.
- **Menu:** giữ thứ tự hành động hiện có, tiếp tục chỉ khi có phiên hợp lệ sau mount; các mục tương lai là nhãn khóa. Không thêm tính năng từ bản thiết kế.
- **Tạo/vào/khôi phục:** cùng kiểu panel; khối phiên lưu ghi mã, biệt danh và phe chờ xác thực. Không hiện token; giữ ưu tiên phiên cũ và luồng xác nhận tạo phòng mới.
- **Phòng chờ:** mã phòng + sao chép, hai ghế với biệt danh/phe/trạng thái bằng chữ. Ghế đã giữ nhưng offline không được trình bày như ghế trống.
- **Bàn online:** lượt, kết nối và cảnh báo ở trên; bàn là vùng lớn nhất. Hành động phụ không che bàn. Giữ bàn local tại `/local`, không đưa “Ván mới” vào online.
- **Offline:** banner vàng đồng, nêu phe và thời gian gần đúng từ deadline server. Về 0 chỉ ghi chờ server xác nhận; không tự xử kết quả, không đếm lại 60 giây khi reconnect.
- **Kết quả:** hiển thị trên bàn, không thay bàn bằng màn hình phủ. Ghi rõ thắng/thua và lý do; trận hủy dùng nhãn trung tính, không có người thắng. Giữ “Về menu” và “Tạo phòng mới” sau kết thúc/hủy; không thêm đường rời trận đang chơi.

## 7. Dấu hiệu trên bàn cờ

Giữ giao điểm, viewBox, vị trí hai phe và vùng bấm hiện có; không tính lại tọa độ bằng pixel màn hình. Phân biệt bằng hình dạng và nét, kể cả khi nhiều dấu cùng giao điểm:

| Ý nghĩa | Hướng thể hiện đề xuất |
|---|---|
| Quân đang chọn | Phóng lớp hình 1,07 lần quanh tâm, viền tròn sáng mảnh, bóng nâng rõ hơn; vẽ trên các quân khác, không đổi dữ liệu hoặc vùng bấm. |
| Nước vừa đi | Đầu: chấm tròn nhỏ; đích: vòng đồng mảnh. Mô tả tọa độ vẫn có cho công nghệ hỗ trợ. |
| Focus bàn phím | Vòng xanh ngoài riêng, chỉ `:focus-visible`; không phải dấu chọn, không còn khung vuông. |
| Chiếu | Cảnh báo chữ “Phe … đang bị chiếu” rõ, không nhấp nháy. Chưa thêm đánh dấu Tướng nếu chưa duyệt riêng. |
| Gợi ý nước đi | Đã đối chiếu: rules có `getLegalMoves`, nhưng frontend local/online và `BoardView` hiện không gọi nó để tạo/vẽ đích gợi ý. Các `.hint` ở form/phòng chỉ là lời nhắc. Chưa có chức năng gợi ý trực quan để thay đổi hoặc xóa. Nếu duyệt hiển thị sau: dành dấu chấm giao điểm trống/vòng đích ăn; không tái dùng dấu chọn hoặc lastMove. |

Các lớp trang trí không bắt pointer event. Giữ roving focus một điểm Tab cho bàn, mũi tên điều hướng, Enter/Space xác nhận, tên truy cập và `aria-pressed`. Bàn khóa/kết thúc vẫn xem bằng bàn phím; không tạo lớp focus thứ hai cho quân. Mục tiêu 48px của nút không được áp thành hit area chồng lấn trên SVG co nhỏ.

## 8. Thành phần dùng chung tối thiểu — chỉ đề xuất

| Thành phần | Bằng chứng lặp trong code và phạm vi |
|---|---|
| Kiểu Button / ActionLink | Menu, RoomForm, sao chép mã, tiếp tục/tạo mới, đầu hàng, kết quả và reset local. Đợt đầu dùng lớp CSS `.xq-action` với variant primary/secondary/danger trên button/Next.js Link; chỉ áp dụng ở menu, không cần component React mới. |
| Panel | Menu có panel chọn cách chơi thật sự: dùng lớp `.xq-panel`, giữ section/heading hiện tại. `.play` và khôi phục/phòng chờ là ứng viên áp dụng sau; không gom state. |
| FormField | Biệt danh và mã phòng trong RoomForm: label, input, mô tả/lỗi; không thêm form framework. |
| Notice | Warning/error/sync/pending trong PlayRoom, phản hồi sao chép trong RoomLobby, banner offline; dùng chung trình bày, không tự tạo timer hoặc quyết định trạng thái. |
| GameSummary | **Chỉ là ứng viên, chưa tách trong đợt đầu.** Local và OnlineBoard đang lặp lượt, quân đang chọn, chiếu và kết quả; cân nhắc sau, không chuyển quyền xác thực sang UI. |

Tiếp tục dùng `BoardView` đã có, không tạo bản SVG mới. Chưa cần thư viện component, provider phiên chung, modal riêng hoặc hệ thống theme động.

## 9. Thứ tự triển khai sau khi duyệt

1. Chốt màu/ngữ nghĩa, chữ và CSS dùng chung; chuẩn hóa menu.
2. Form tạo/vào/khôi phục và phòng chờ.
3. Khung bàn local/online, trạng thái offline và kết quả; kiểm tra các dấu chồng nhau.
4. Kiểm chứng 375px/desktop, zoom, Tab/mũi tên, tương phản và reduced motion; chạy kiểm tra hồi quy phù hợp.

Màu/breakpoint được phép điều chỉnh để đạt các tiêu chí dưới đây; phải ghi giá trị trước/sau, lý do và phần đã kiểm chứng. Đợt đầu chuyển breakpoint menu từ 650px lên 768px để giữ một cột lâu hơn khi chữ tăng lên tối thiểu 14px và tránh chật panel. Không đổi thứ tự/nội dung/đường dẫn hoặc điều kiện hiển thị.

## 10. Checklist nghiệm thu

- [ ] 375px, 768px, 1024px, desktop rộng; zoom 200%: không tràn ngang, mất chữ, che focus hoặc chồng nút. Menu một cột dưới 768px; mobile có thể cuộn dọc.
- [ ] Biệt danh 30 code point, gồm tên không có khoảng trắng; mã phòng, lỗi storage và nhãn dài xuống dòng, không đẩy panel rộng hơn viewport.
- [ ] Tab/Shift+Tab đúng thứ tự; Enter kích hoạt link, Enter/Space kích hoạt button; disabled không nhận thao tác. Bàn giữ roving focus/mũi tên, không tạo thêm lớp focus.
- [ ] Đo chữ thường ≥4,5:1; focus/biên điều khiển có ý nghĩa ≥3:1 với nền kề. Kiểm tra normal/hover/pressed/focus, chữ disabled còn đọc được và nền gradient thực tế.
- [ ] Reduced motion tắt transition không cần thiết; hover không thay bố cục; không chỉ dùng màu để báo trạng thái.
- [ ] Menu giữ nguyên nội dung, thứ tự, href; SSR chưa đọc storage, sau mount mới hiện tiếp tục; token không có trong DOM/URL. Menu không tạo socket hoặc POST.
- [ ] Tạo phòng khi giữ phiên cũ vẫn qua xác nhận/đồng bộ/đầu hàng; hủy giữ phiên. Nhiều tab và callback cũ không xóa credentials mới.
- [ ] Local/reset/trang development, phòng chờ, online move/resign/pending/reconnect/offline/kết quả vẫn giữ hành vi; không thêm hành động khi trận còn chơi.
- [ ] Lint, build, test menu và test hồi quy liên quan đạt; ghi rõ ca kiểm tra bằng công cụ và ca cần thử trình duyệt, không đánh dấu đạt khi chưa thử.

Checklist là điều kiện nghiệm thu từng đợt, chưa mặc định đạt vì tài liệu được duyệt. Đợt đầu chưa sửa form, phòng chờ, bàn hoặc logic game.

### Kiểm chứng đợt menu

- Đã tính tương phản từ CSS cuối cùng: 42 cặp màu trạng thái và 5 phép kiểm tra nền gradient theo biên RGB bảo thủ; chữ thấp nhất 4,76:1, biên/focus đã kiểm tra thấp nhất 3,63:1. Đây là tính toán màu, không phải đo pixel từ trình duyệt.
- Primary hover đổi từ `#BB4332` sang `#B13D2E`; viền primary đổi từ vàng đồng `#DFB875` sang vàng sáng `#F3CF88` để đạt ngưỡng cả ở hover. Panel 8px, chữ phụ 14px và breakpoint 768px theo hướng đã duyệt.
- Test frontend 42/42 (gồm thứ tự href, phiên lưu/biệt danh dài, local/reset, luồng online và callback cũ), lint và production build đạt. Chưa kiểm chứng trực quan 375px/zoom, hover/focus/reduced motion hoặc hai cửa sổ bằng trình duyệt; các mục đó vẫn cần thử thủ công.
