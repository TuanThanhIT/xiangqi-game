# Backend cửa hàng, kho và loadout Giải trí

## Migration và nguồn danh mục

Migration `0003_thin_payback.sql` tạo `shop_items`, `inventory_items`,
`inventory_starter_grants`, `item_purchases`, `match_loadouts` và thêm
`purchase_id` vào `wallet_entries`. Migration là nguồn dữ liệu chính thức cho
giá hiện hành; controller và client không chứa bảng giá riêng.

| code | Tên | Giá vàng |
|---|---|---:|
| `scout` | Trinh sát | 30 |
| `time_saver` | Tiết kiệm thời gian | 40 |
| `unseal` | Phá ấn | 50 |
| `shield_breaker` | Phá khiên | 50 |
| `time_pressure` | Thời áp | 60 |
| `time_extension` | Gia hạn | 70 |
| `calm` | Tĩnh tâm | 80 |
| `shield` | Khiên | 100 |
| `seal` | Phong ấn | 130 |
| `revive` | Hồi sinh | 180 |

`grant_inventory_starter(accountId)` cấp đúng `starter_quantity` cho tài khoản
đã xác minh. Khóa `(account_id, item_code)` trong bảng nhật ký cấp quà làm retry
idempotent. Khi thêm món dùng thử mới, migration mới phải thêm đúng dòng catalog
rồi gọi hàm này cho tài khoản cũ; các món cũ không được cấp lại.

## API

Tất cả API yêu cầu access token. API ghi còn yêu cầu Origin hợp lệ và không tự
retry POST.

- `GET /shop/items`: toàn bộ danh mục và trạng thái `onSale`, gồm `code`, tên, mô tả, nhóm,
  `priceGold`, thứ tự, version và metadata.
- `GET /inventory`: kho của chính tài khoản đăng nhập.
- `POST /shop/purchases`: `{ requestId: UUIDv4, itemCode, quantity }`, với
  `quantity` từ 1 đến 99. Response gồm giá đơn vị/tổng giá lấy từ server, số
  lượng kho và vàng khả dụng sau giao dịch.
- `GET /casual-rooms/:code/loadout`: chỉ thành viên phòng xem lựa chọn của chính
  mình; trả `{ roomCode, itemsEnabled, locked, matchId, itemCodes }`.
- `POST /casual-rooms/:code/loadout`: `{ itemCodes: string[] }`, từ 0 đến 3 code
  khác nhau và phải sở hữu ít nhất một đơn vị. Đổi lựa chọn bỏ trạng thái sẵn
  sàng của chính người đổi.
- `POST /casual-rooms/:code/items`: `{ enabled: boolean }`; chỉ chủ phòng và chỉ
  khi cả hai chưa sẵn sàng.

Mã lỗi chính: `INVALID_PURCHASE`, `ITEM_NOT_FOUND`, `ITEM_NOT_FOR_SALE`,
`INSUFFICIENT_GOLD`, `PURCHASE_LIMIT`, `IDEMPOTENCY_KEY_CONFLICT`,
`INVALID_LOADOUT`, `DUPLICATE_LOADOUT_ITEM`, `LOADOUT_ITEM_NOT_OWNED`,
`ITEMS_DISABLED`, `NOT_ROOM_OWNER`, `PLAYERS_READY`, `ROOM_STARTING`.

## Tính nguyên tử và idempotency

Mỗi lần mua khóa dòng ví của tài khoản. Trong cùng transaction PostgreSQL,
server đọc giá/trạng thái bán, kiểm tra `available_gold`, cộng kho, tạo purchase,
trừ ví và ghi `wallet_entries(reason='item_purchase', purchase_id=...)`.
`held_gold` không được dùng. Khóa duy nhất `(account_id, request_id)` bảo đảm
cùng key/cùng payload trả kết quả cũ; cùng key/payload khác trả conflict; các
request đồng thời chỉ ghi một lần. Lỗi ở bất kỳ bước nào rollback toàn bộ.

## Loadout và ranh giới riêng tư

Phòng chỉ phát công khai `itemsEnabled`; `room:state`, `game:state` và log không
chứa item code đã chọn. Danh sách chỉ đi qua API loadout có kiểm tra thành viên
và luôn lấy theo account đang xác thực. Khi cả hai sẵn sàng, server tạo một
`matchId` cho lần chuẩn bị, kiểm tra lại quyền sở hữu và ghi snapshot vào
`match_loadouts` trước khi tạo trận. Trang bị không trừ kho. Reconnect trong cùng
phòng RAM giữ lựa chọn/snapshot; phòng tắt vật phẩm bắt đầu mà không tạo snapshot.

## Lệnh vận hành và kiểm thử

```powershell
cd apps/server
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd run test:items
npm.cmd run test:wallet
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

`test:items` tạo schema PostgreSQL ngẫu nhiên, chạy toàn bộ migration và xóa
schema trong `finally`; nó không tiêm lỗi vào bảng `public`.

## Checklist frontend cho lượt sau

- Đọc catalog/giá từ `GET /shop/items`, không sao chép bảng giá vào client.
- Gửi UUIDv4 mới cho ý định mua mới; giữ nguyên requestId khi retry cùng ý định.
- Hiển thị riêng `availableGold` và `heldGold`; xác nhận số lượng 1–99.
- Kho/loadout chỉ dùng dữ liệu của tài khoản hiện tại; không suy đoán đồ đối thủ.
- Nối `itemsEnabled`, API bật/tắt của chủ phòng và API loadout trước nút Sẵn sàng.
- Cập nhật validator `room:state` để chấp nhận `itemsEnabled` trước khi nối UI.

Chưa triển khai: UI, API dùng vật phẩm, hiệu ứng bàn cờ, tiêu hao khi dùng, bán
lại, điểm danh, nhiệm vụ và thưởng thắng 5 vàng.
