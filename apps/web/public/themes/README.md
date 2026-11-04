# Asset năm phong cách

Ngày tạo: 2026-11-03. Công cụ: image_gen tích hợp; không dùng ảnh stock/hotlink.
Concept do người dùng cung cấp tại `docs/design/concepts/` chỉ là tham chiếu,
không được dùng nguyên ảnh làm nền. Asset mới là ảnh raster sinh riêng; không
gán giấy phép của skill ui-ux-pro-max cho các ảnh này.

Mỗi thư mục earth/meadow/ink/bamboo/snow có:

- `page-bg.webp`: 1672×941, phong cảnh sạch, không bàn/quân/chữ/UI.
- `ground.webp`: 512×512, texture mặt phẳng ít tương phản.
- `preview.webp`: 320×180, bản nhỏ của phong cảnh; mini bàn được vẽ thêm bằng CSS.

Không phóng ảnh lên kích thước mục tiêu ban đầu 1920×1080/1024×1024 khi nguồn
trả về nhỏ hơn. Bản hiện có được kiểm tra trực tiếp trên screenshot desktop.
PNG gốc giữ trong thư mục generated_images của Codex, không đưa vào bundle.
sharp đã có qua Next.js được dùng để chuyển WebP và thu nhỏ preview; không thêm
dependency. Manifest `ASSETS.json` ghi kích thước và dung lượng thực tế.
Nền 60–122 KB, ground 2–8 KB, preview 4–6 KB; toàn bộ khoảng 615 KB.

Prompt nền chung: clean landscape 16:9 background for a modern historical Chinese
Xiangqi web game; refined 2D painterly natural environment; quiet central 60%,
detail at outer edges/corners; environment only; no chessboard, grid, pieces,
people, characters, typography, numbers, logos, buttons, UI or watermark.

| Theme | Chỉ dẫn cảnh | Chỉ dẫn texture (dùng ảnh nền tương ứng làm tham chiếu) |
|---|---|---|
| earth | warm ochre earth, sand, wood/bronze, jade stream | light golden fine-grain earth |
| meadow | gentle green grass, worn ground, stream, warm wood | pale yellow-green grass/worn earth |
| ink | ivory rice paper, ink mountains at borders, jade water | ivory rice-paper fibers |
| bamboo | bamboo forest at margins, soft mist, jade/forest green | pale green bamboo fibers, no stalks |
| snow | snowy peaks at borders, cool mist, stone/silver, ice | light blue-gray stone/frost, no cracks |

Prompt texture chung: separate square seamless top-down flat low-contrast material
tile; no objects, perspective, frame, grid, pieces, lettering or UI. Không chạy
installer hoặc dùng thư viện ảnh ngoài. Khung, sông/sóng, lưới, cung, dấu trạng
thái là SVG/CSS; tọa độ và tương tác không nằm trong bitmap.

Catalog duy nhất: `src/features/rooms/room-theme.ts`. Chỉ theme được chọn tải
nền lớn và texture; bộ chọn tải năm preview nhỏ. Có màu nền fallback khi ảnh lỗi.
