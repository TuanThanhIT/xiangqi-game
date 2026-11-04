# Màn hình trận 2.5D — kiểm chứng 2026-11-04

### Tinh chỉnh khay theo ảnh bên phải

Chỉ sửa `captured.css`: khung gỗ nhiều lớp/viền đồng sáng, đầu khay có đường chia,
lòng lõm có viền trong và bóng tiếp xúc; giữ nguyên hộp ngoài104px/vị trí/sức chứa.
Không đổi component/dữ liệu. [Ảnh khay15 quân mới](screenshots/tray-refined/capacity-fixture-earth.png).
Test liên quan8/8, lint và diff-check đạt; Chrome60 phép đo không tràn, bàn lệch0px.
Khung được dựng bằng CSS, vẫn giản lược vân gỗ thật trong ảnh mẫu; không thêm asset.

## Khay quân bị ăn và huy hiệu BẠN

- Helper thuần `features/board/captured-pieces.ts` dùng danh sách khai cuộc từ
  createInitialPieces, so ID với pieces hiện tại. Phân theo phe quân đã mất;
  không lưu state khay, không sửa input, không đưa Tướng vào khay. Kết quả có thứ
  tự khai cuộc ổn định, không phải thứ tự bị ăn. null không render, tránh hiểu
  chưa có snapshot thành mất toàn bộ quân. Chỉ dùng cho khai cuộc chuẩn V1.
- BoardStage/CapturedTrays dùng chung local/online. Online chỉ nhận pieces của
  game snapshot đã được hook xác thực; click/ack không cập nhật khay riêng.
  Reload/reconnect dựng lại bằng ID, không cần lịch sử. Local reset về32 quân
  làm khay rỗng. Khi có initialGame (fixture rút gọn), khay bị ẩn cả sau reset,
  không suy diễn quân lược khỏi fixture thành quân đã bị ăn.
- Desktop đủ chỗ: khay104px, gap14px; Đen trái/nửa trên, Đỏ phải/nửa dưới.
  Chiều cao nửa bàn cố định, lưới hai cột/tám hàng co theo chiều cao, chứa15 quân.
  SVG quân nhỏ dùng cùng mapping chữ Hán/tên tiếng Việt với BoardView; không Tab,
  drag hoặc sự kiện chọn quân. Có danh sách tên truy cập, khay rỗng ghi Chưa có.
- Mobile/narrow: hai badge phe/số mở popover native, không tự mở khi có capture.
  Enter mở, Escape đóng/trả focus; button Đóng rõ. Badge dùng phần phản hồi đã
  có trên online, không thu bàn hoặc chèn giữa bàn và thanh tên. Local có hàng
  badge riêng và giảm khoảng cuối trang dư thừa. Nội dung quá thấp cuộn được.
- Huy hiệu BẠN có viền đồng, font Arial, không lấy từ nickname hoặc lượt. Nhãn
  truy cập vẫn xác định người chơi hiện tại. Quyền/synced/active/pending không đổi.

### Kiểm chứng

71 test frontend đạt; lint/build và git diff --check đạt. Helper được kiểm tra
khai cuộc/null, ID hai quân cùng loại, bất biến, kết quả độc lập, reset, fixture,
15 quân mỗi phe và không có Tướng. Test online xác nhận lỗi/kết quả riêng không
tạo quân bị ăn, chỉ pieces snapshot đổi mới đổi khay. Không chạy backend/rules.

Chrome thật: [60 phép đo](screenshots/captured/after-metrics.json), sai lệch bàn0px
giữa các trạng thái và so với số đo layout đã duyệt trước thêm khay. Không tràn
trang online ở1366×768,1920×920,375×667,390×844; năm theme đều được chụp.
Đã đi/ăn thật hai phe: khay Đen2 Tốt, Đỏ1 Tốt; reload/tiếp tục giữ đúng, offline/
reconnect/đầu hàng không tự tạo quân. Panel mobile mở Enter, đóng Escape và focus
trở về nút. Local ăn/reset đúng, hai dev fixture không có khay.

Ảnh thật: [rỗng](screenshots/captured/after-earth-normal-1366x768.jpg),
[sau ăn hai phe](screenshots/captured/after-earth-captured-both-1366x768.jpg),
[panel mobile](screenshots/captured/mobile-tray-open.png),
[reload giữ khay](screenshots/captured/after-earth-restored-captures-375x667.jpg).
[Sức chứa15 quân](screenshots/captured/capacity-fixture-earth.png) là fixture
trình bày tách biệt, render chính CapturedTrays trong browser, không thay bàn thật
hoặc route ứng dụng. Có fixture tương ứng meadow/ink/bamboo/snow, kiểm tra bounding
box mọi icon nằm trong khay. Token màu dùng lại nameplate, qua test tương phản.

### Giới hạn

Khay tĩnh, chưa có hiệu ứng bay250–350ms. Luồng giao diện hiện chưa cung cấp một
tín hiệu presentation đủ rõ để phân biệt chắc chắn bước capture liên tục với
snapshot phục hồi; không thêm state lịch sử hoặc thay giao thức chỉ để animation.
Do đó mount/reload/reconnect/trùng revision không có hiệu ứng bị phát lại.
Chưa nghiệm thu điện thoại vật lý, screen reader hoặc zoom200% thật. Khay/icon
được thu nhỏ khi bàn thấp; vân gỗ CSS giản lược hơn ảnh concept, không thêm asset.

## Mới nhất: bảng treo ngoài cụm bàn và pill tiếng Việt

Thay thế ngân sách/header của các đợt bên dưới. Không còn header ngang/hàng trống
44px. Bảng gỗ fixed left24/top16, rộng232 cao110, dây treo CSS tĩnh. Chữ/nút vẫn
HTML và button thật, dùng token nameplate của theme. Hai thanh36px/gap4px,
padding trang8px trên/dưới: `Hboard = 100dvh - 96px`.

Bảng treo cần ít nhất272px trống bên trái. Chỉ bật ở width≥1200 và tỉ lệ viewport
≥3/2; ngoài điều kiện đó dùng hàng phòng40px trong luồng và ngân sách264px
(bao gồm notice/hành động120px). Không đổi menu/form/phòng chờ hoặc logic socket.
Tên người dùng/phe/badge, nền/texture/sông/cầu/lưới/hit area không đổi.

Chuỗi cũ trong nguồn đã NFC; vấn đề thị giác liên quan font Georgia thừa hưởng
từ nameplate. Nay HTML “ĐẾN LƯỢT” NFC dùng Arial/system-ui, line-height1,3,
pill tĩnh có viền, không transform/letter-spacing/tách ký tự. Không sửa active
state; giữ thông báo lượt cho screen reader, pill aria-hidden tránh đọc trùng.

| Viewport | Bàn mới | Bàn trước | Bảng phòng |
|---|---|---|---|
| 1366×768 | 606,11×671,98 | 562,81×623,98 | fixed232×110, không chồng bàn |
| 1920×920 | 743,20×823,98 | 699,91×775,97 | fixed232×110, không chồng bàn |
| 375×667 | 343×380,28 | 347,25×384,98 | hàng phòng gọn |
| 390×844 | 358×396,91 | 374×414,64 | hàng phòng gọn |

Mobile dùng lề bàn16px mỗi bên từ giới hạn chiều rộng hiện tại, ưu tiên đủ nút
và nội dung phản hồi. Không kéo méo tỉ lệ552/612. Desktop tăng đúng48px chiều cao.
Chrome thật: [52 phép đo](screenshots/hanging/after-metrics.json), độ lệch bàn
qua normal/selected/lỗi/copy/offline/kết thúc0px; không tràn. Hai thanh bằng
rộng bàn/cao36, bảng treo không chồng bàn; năm theme đều đo/chụp bốn viewport.
Ảnh `screenshots/hanging/after-{theme}-{state}-{viewport}.jpg`, gồm hai lượt và375px.
Đã kiểm tra computed fontArial và textNFC trên browser, tên dài Enter/Escape,
thông báo PageDown, copy, đi quân, offline/reconnect/đầu hàng/về menu.

Test66 frontend, lint/build, git diff --check đạt; không chạy lại backend/rules.
next-env.d.ts bảo toàn. Chưa thử zoom200%/screen reader/điện thoại vật lý; fallback
chiều cao thấp được phép cuộn tự nhiên. Bảng gỗ/dây và khung vẫn giản lược so với
ảnh mẫu; không thêm asset, không thay nền trang. Không commit/push.

## Bờ sông liền mặt bàn, cầu nhỏ và nameplate gỗ

Nguồn dải sáng cũ: path board-bank stroke màu nền trơn không có texture, cùng
hai rect ground dừng ở y276/y336. Đã bỏ path/stroke này; ground là một rect
x12/y12/w528/h588 liên tục dưới nước. Không phủ thêm lớp che. Nước vẫn clip
x36/y276/w480/h60; 楚河/漢界 và lưới/hit area không đổi.

Hai RiverBridge dùng chung SVG, x18..30 và x522..534, y276..336: rộng12 trong
lề ngoài lưới, ván/lan can/trụ đơn giản, bóng nhẹ. Vẽ dưới quân, aria-hidden và
pointer-events none. Quân ở hai bờ có thể che một phần cầu, cầu không che quân.
Không mở rộng viewBox hoặc tác động luật vượt sông.

Thanh vẫn40px/cùng rộng với bàn: vân gỗ CSS tĩnh, viền đồng/góc nhỏ, ánh sáng
trên trái. Badge Đen將 nền mực, Đỏ帥 nền son, tên truy cập phe tiếng Việt.
Token nameplate riêng cho năm theme; ink dùng gỗ ngà/chữ mực. Active chỉ đổi
màu nền/viền/glow và vạch2px ở trái, không đổi padding/box; giữ nhãn Đến lượt
và điều kiện synced/playEnabled/playing từ đợt trước, không timer hoặc pulse.

Test66 frontend đạt, gồm bờ texture liền, hai cầu ngoài lưới/20 ván/4 lan can,
badge, offline/active/result và tương phản nameplate cả năm palette. Lint/build
và git diff --check đạt. Không chạy backend/rules vì không sửa phần liên quan.
Không thêm raster/dependency. next-env.d.ts và các thay đổi có sẵn được giữ.

Chrome thật: [52 phép đo](screenshots/bridges/after-metrics.json), lệch bàn0px,
không tràn ở bốn viewport; kiểm tra năm theme, hai lượt, tên dài, Enter/Escape,
notice cuộn bằng phím, offline/reconnect, đầu hàng/kết thúc và về menu.
Ảnh hai lượt: `screenshots/bridges/after-earth-{black-turn,red-turn-marks}-1366x768.jpg`.
Cận cảnh [cầu/bờ khi trống](screenshots/bridges/river-bridges-normal-closeup.png)
và [quân ở hai mép](screenshots/bridges/river-bridges-both-edges-river-closeup.png).
Có ảnh375px và bốn theme còn lại trong cùng thư mục.

Khác mẫu: cầu phải rất nhỏ vì lề24 đơn vị, nước có mép thẳng sạch thay vì bờ lượn
lớn; vân gỗ CSS tiết chế hơn ảnh texture thật. Giữ toàn bộ ảnh nền cũ. Chưa thử
screen reader hoặc font trên điện thoại vật lý; reduced motion không có pulse,
transition chọn quân vẫn dùng quy tắc tắt đã có.

## Chất liệu và dấu truyền thống

Giữ nguyên ngân sách layout đã duyệt. Dùng lại năm ground.webp, nâng opacity
0,22→0,36; thêm pattern hạt SVG nhỏ dùng chung, không thêm bitmap/dependency/filter
từng quân. Gradient quân giảm trắng từ #fffdf5/#fff8e9 sang #fff6e3/#f4e5c7,
cạnh ngà phía dưới và bóng tiếp xúc nhẹ; quân không bị nhuộm màu theme.

14 dấu cố định từ STEP60: Pháo2/7,cột1/7; Tốt3/6,cột0/2/4/6/8.
Khoảng hở và tay L bằng STEP×0,12; col0 chỉ bên phải, col8 chỉ bên trái.
SVG nằm dưới quân, không pointer/focus, không phụ thuộc danh sách quân.
Chữ楚河/漢界 ở x(2)/x(6), giữa y(4)/y(5), cỡ23, trong clip sông.
Mô tả truy cập một lần “Sở Hà, Hán Giới”; các lớp trang trí aria-hidden.

Thanh40px giữ nguyên: badge hệ thống12px ổn định, tên text có ellipsis/popover,
nhãn Bạn vẫn lấy identity. Hiệu ứng lượt dùng synced + identity + playEnabled và
result playing, không dùng quyền canPlay riêng của người xem; không timer hoặc
tính luật. Viền/accent, nền surface-raised, glow tĩnh kèm chữ Đến lượt; chữ thị
giác aria-hidden để không đọc trùng thông báo lượt có sẵn. Offline/kết thúc tắt.

Chrome thật: [48 số đo](screenshots/material/after-metrics.json), sai lệch bàn0px,
không tràn; ảnh `screenshots/material/after-{theme}-{state}-{viewport}.jpg`.
Có ảnh black-turn/red-turn-marks sau khi Tốt hai phe rời vị trí và ảnh375px.
Đã xem earth, meadow, ink; font Hán và nước vẫn rõ, giữ nền riêng từng theme.
Test64 frontend/lint/build/diff-check đạt; backend/rules không sửa/không chạy lại.
Đo bảo thủ texture36% và hạt12%: dấu/lưới/focus tối thiểu3,46:1; chữ sông5,85:1.
Các màu button/thanh tiếp tục qua test tương phản năm palette.

Không thêm asset; vân/khung vẫn tiết chế hơn bàn thật, hạt mịn có thể ít thấy ở
độ thu nhỏ mobile. Chưa nghiệm thu font trên điện thoại vật lý hoặc screen reader.

## Cập nhật bám ảnh tham chiếu: ngân sách 144px và clip sông

Mục này thay thế ngân sách viewport/vùng dự phòng của các đợt bên dưới.
Đã gom CSS trận trong `match.css`, bỏ định nghĩa sidebar và override online cũ.
Header full viewport 44px, lề ngang desktop 24px, mã thật + icon copy SVG 40px.
Hai thanh đúng 40px, gap4px, badge tròn, tên text cùng nền, nhãn Bạn từ identity.

Desktop: `Hboard = 100dvh - 144px`; rộng theo 552/612 và giới hạn chiều ngang.
Không còn hàng phản hồi trống dưới bàn. Notice/kết quả ở panel cạnh bàn ngoài
luồng, cuộn được bằng bàn phím; không phủ quân. Kết quả có nút về menu/tạo mới
ngay ở panel, không cần dialog hoặc thay đổi trạng thái game. Dưới1100px dùng
ngân sách riêng282px gồm hành động và notice120px, không đè lên bàn.

Sông suy từ constants: x36/y276/width480/height60, clipPath dùng ID riêng từ useId.
Nước/bờ/gợn đều trong clip; lưới và hit area không thay đổi. Ảnh nền giữ nguyên.

| Viewport thật | Bàn đo bằng Chrome | Hai thanh |
|---|---|---|
| 1366×768 | 562,81×623,98 | Cùng rộng với bàn, cao40 |
| 1920×920 | 699,91×775,97 | Cùng rộng với bàn, cao40 |
| 375×667 | 347,25×384,98 | Cùng rộng với bàn, cao40 |
| 390×844 | 374×414,64 | Cùng rộng với bàn, cao40 |

[40 phép đo thực](screenshots/reference/after-metrics.json): chênh lệch x/y/w/h
giữa normal, selected, nước sai, copy, offline, finished là0px. Cả năm theme
không tràn trang; đã xem screenshot earth/ink desktop và kết quả mobile.
Ảnh: `screenshots/reference/after-{theme}-{state}-{viewport}.jpg`.
Test62 frontend, lint/build và diff-check đạt; test clip kiểm tra hình chữ nhật
và ID riêng nhiều bàn. Đã thử Enter/Escape tên dài, PageDown notice, copy,
nước sai/offline/reconnect/đầu hàng/về menu. Backend/rules không đổi/không chạy lại.

Khác ảnh mẫu: giữ phong cảnh cũ, vân bàn/khung và gợn nước giản lược; font chữ
Hán phụ thuộc hệ thống. Không tạo asset mới. Chưa đo zoom200% hoặc screen reader;
chế độ viewport rất thấp cho phép cuộn tự nhiên, chưa nghiệm thu trực quan riêng.

## Bố cục mới đã duyệt: bỏ sidebar

Phần này thay thế quy tắc sidebar bên dưới. Trận online dùng header 48px
(mobile 44px), thanh Đen 38px → bàn → thanh Đỏ 38px (mobile 36px), cách nhau
4px. Cả hai thanh cùng chiều rộng bàn. Nhãn Bạn chỉ lấy từ ghế đã xác thực.
Header giữ mã/sao chép với phản hồi ngắn. Tên dài rút gọn, Enter/chạm mở popover,
Escape hoặc Đóng để trở lại. Online/offline có chữ, không chỉ chấm màu.

Một ngân sách chiều cao cố định theo `100dvh` được dùng cho mọi trạng thái;
không co bàn theo lỗi/offline/kết thúc. Vùng thông báo 92px có phần cuộn được
bằng bàn phím; nút sau trận ở hàng riêng. Đầu hàng giữ xác nhận/disabled cũ,
ở góc dưới phải desktop rộng và hàng hành động riêng trên mobile. Màn hình
rất thấp được cuộn tự nhiên, không cắt bằng overflow hidden hoặc CSS zoom.

Chrome thật: 40 phép đo, sai lệch bounding box bàn giữa normal/selected/nước sai/
copy/offline/finished = **0px** ở bốn viewport; không tràn trang. Bốn theme còn lại
được chụp và đo cùng layout. [Số đo](screenshots/centered/after-metrics.json),
ảnh `screenshots/centered/after-{theme}-{state}-{viewport}.jpg`.

| Viewport | Bàn | Vị trí trên |
|---|---|---|
| 1366×768 | 465×516 | y94 |
| 1920×1080 | 747×828 | y94 |
| 375×667 | 359×398 | y88 |
| 390×844 | 374×415 | y88 |

Đã thử chọn quân, nước sai, copy, offline/reconnect, đầu hàng/kết quả/về menu;
tên dài mở bằng Enter, Escape đóng; PageDown đọc thông báo dài mà bàn không đổi.
Test frontend 62 đạt; lint/build đạt. Không sửa backend/rules, không chạy lại
test hai phần đó. `next-env.d.ts` giữ nguyên. Không thêm ảnh/dependency.
Chưa thử zoom trình duyệt 200% hoặc điện thoại vật lý/screen reader.
Khác ảnh mẫu: giữ phong cảnh cũ theo yêu cầu, khung/texture và nước vẫn giản lược;
có vùng phản hồi dự phòng nên bàn desktop thấp hơn ảnh mẫu để không nhảy khi lỗi.
Không tuyên bố sao chép đầy đủ chất liệu ảnh mẫu.

Phạm vi: trình bày local/online và năm theme. Không đổi backend, rules, session,
socket, pending/retry, timeout hoặc quyền đi/đầu hàng. Không thêm dependency/font.

## Quy tắc triển khai

- Chỉ trận đấu dùng layout gọn; form/phòng chờ vẫn cuộn tự nhiên. Header 52px
  desktop, 48px mobile; sidebar desktop 240px. Mobile có hai ghế ngắn, sao chép
  và đầu hàng, trạng thái lượt, bàn. Thông tin kỹ thuật lặp được giữ cho screen
  reader thay vì chiếm chiều cao; phản hồi sao chép không làm nhảy layout.
- Chiều rộng SVG giới hạn cả bởi chiều rộng vùng chính và chiều cao `100dvh`
  trừ vùng dành cho điều khiển/thông báo. Không cắt bằng overflow hidden. Kết quả
  hoặc offline dành thêm chiều cao; màn hình rất thấp/zoom lớn cuộn tự nhiên.
- Selected: lớp hình scale 1,07 quanh tâm, bóng/viền sáng; render cuối lớp quân
  bằng mảng dẫn xuất mới. Dữ liệu và thứ tự 90 vùng bấm vẫn nguyên.
- Focus: vòng xanh r33, chỉ focus-visible. LastMove: chấm r6 ở đầu, vòng r30 ở
  đích. Không có khung vuông; title/aria-pressed/tên tiếng Việt được giữ.
- Quân có gradient ngà, cạnh dưới, ellipse bóng tiếp xúc; không filter từng quân.
  Chỉ một drop-shadow nhẹ cho bàn. Transition 150ms, reduced motion tắt transition.
  `useId` tạo tên riêng cho title/desc/pattern/gradient khi có nhiều bàn.
- Khung có nét sáng/tối, nước có gradient nhẹ, bờ cong và gợn rời không đều;
  không hoạt ảnh liên tục. Dùng lại ảnh nền/texture hiện có, không thêm raster.
- Focus xanh đổi `#245B91` → `#1E4F7B` vì màu cũ dưới 3:1 trên stop nước đậm.
  Test mới kiểm tra cả stop nước đậm và ba stop nền quân; cả hai phe đạt 4,5:1.

## Browser thật và số đo

Chrome headless với profile riêng; dùng hai người trong phòng thử mới, không
đụng phiên người dùng. Không cài Playwright hoặc framework. Toàn bộ số đo:
[trước](screenshots/compact/before-metrics.json),
[sau, đủ năm theme](screenshots/compact/after-metrics.json),
[hồi quy/selected/offline/local](screenshots/compact/extra-metrics.json).

| Viewport | Bàn online sau chỉnh | Đáy bàn | Cuộn ngang/dọc đang chơi |
|---|---|---|---|
| 1366×768 | 552×612 | 726 | Không / Không |
| 1920×1080 | 764×847 | 961 | Không / Không |
| 375×667 | 359×398 | 646 | Không / Không |
| 390×844 | 374×415 | 663 | Không / Không |

Các số trên giống nhau ở cả năm theme, kể cả tên dài không khoảng trắng. Trước
chỉnh, bàn ở 375px bắt đầu dưới y815, dưới viewport. Sau chỉnh, trạng thái kết
quả đầu hàng và offline/deadline ở 375×667 cũng không cuộn; bàn co nhỏ hơn để
giữ thông báo/nút 48px. Local cũng được đo cả bốn kích thước, không cuộn.

Đã thử đi quân bằng bàn phím, đi/ăn bằng chuột, reload/tiếp tục giữ bàn, offline
rồi reconnect, đầu hàng, về menu, local/hủy reset/reset và hai trang development.
Đo selected: scale 1,07; độ lệch tâm hình quân so với hit area bằng 0 ở cả hai trục.
Chuột không để lại focus-visible; bàn phím có vòng focus. Reduced motion trả
transition-duration 0s. Test frontend bao phủ thêm callback cũ/pending/retry,
đầu hàng/timeout/hủy, ID SVG riêng và dữ liệu đầu vào bất biến.

Kết quả kỹ thuật cuối: 60/60 test frontend, ESLint, production build và
`git diff --check` đạt. Không chạy lại backend/rules vì không sửa phần liên quan.
`next-env.d.ts` được bảo toàn nguyên trạng qua build. Không commit/push.

## Đối chiếu concept và giới hạn

Đã mở hai concept trong `concepts/` và ảnh sau trong `screenshots/compact/`:
`after-{earth,meadow,ink,bamboo,snow}-1366x768.png`; mỗi theme có thêm ảnh ở ba
viewport còn lại, selected/focus, lastMove và kết quả mobile. Ảnh before có bốn
viewport của earth. Screenshot development có chỉ báo Next, không thuộc bản vẽ.

Giữ nhận diện đất/gỗ/đồng, đồng cỏ, giấy/mực sáng, trúc và tuyết/đá. Khung SVG
và gợn nước giản lược, chưa có chạm khắc/vân khung chi tiết như concept; không
thêm avatar, chữ sông hoặc nút giả trong concept. Gradient không được coi là
thay thế đầy đủ mỹ thuật concept. Cần người dùng duyệt chất liệu trên thiết bị
thật và font Hán hệ thống; chưa kiểm chứng screen reader hoặc zoom trình duyệt
200% thật. Timeout/hủy và trạng thái chưa rõ kết quả được test tự động; lượt này
không chờ hết 60 giây thật trên trình duyệt.
