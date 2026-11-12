# Vật phẩm trong trận Giải trí — backend

Tài liệu này mô tả diff triển khai trên nền commit `4d9588e2d4603d1b95d2ddebd22550702a28caf5`. Backend vẫn giữ toàn bộ bàn/trận active trong RAM, một process giữ PostgreSQL advisory lock; không mở rộng thành persistence toàn bộ trận hoặc nhiều instance.

## Schema và transaction tiêu hao

Migration `0004_shallow_blacklash.sql` thêm `item_usages`. Bản ghi chứa match/account/request, fingerprint, item/mục tiêu, `acceptedAt`, `committedAt`, kết quả riêng, metadata và số lượng tiêu hao. Unique `(matchId, accountId, requestId)` chống retry tiêu hao lại; unique `(matchId, accountId, itemCode)` thực thi một lần dùng cho mỗi loại đã mang.

Transaction lấy advisory transaction lock theo account, tra idempotency, xác minh `match_loadouts`, khóa quy tắc đã dùng, trừ `inventory_items.quantity` với điều kiện còn ít nhất một và ghi usage. Rollback không đổi kho. Khi kết quả commit chưa rõ, match giữ pending, chặn gameplay và tra lại requestId; chỉ commit bền vững mới cài effect vào RAM. Không dùng wallet ledger.

## Socket protocol

Client gửi event `match:item:use`:

```json
{
  "matchId": "UUIDv4",
  "requestId": "UUIDv4",
  "expectedVersion": 3,
  "itemCode": "shield",
  "targetPieceId": "red-soldier-0"
}
```

`targetPieceId` bắt buộc cho `scout`, `unseal`, `shield_breaker`, `shield`, `seal`, `revive`; các món thời gian không được gửi trường này. Parser từ chối trường thừa. Client không gửi giá trị effect, thời gian, số lượng hoặc kết quả bàn.

Ack thành công có `requestId`, `stateVersion`; Trinh sát thêm kết quả riêng. Lỗi chính: `invalid_item_request`, `items_disabled`, `match_not_active`, `stale_version`, `not_your_turn`, `item_not_equipped`, `item_already_used`, `item_already_used_this_turn`, `invalid_item_target`, `item_no_effect`, `item_no_legal_move`, `item_inventory_empty`, `request_id_conflict`, `action_pending`, `internal_error`.

## Thứ tự xử lý và idempotency

Server xác thực socket/account/ghế, phân xử deadline, kiểm tra version/lượt/loadout/hạn mức, mô phỏng effect và bảo đảm còn nước hợp lệ. `acceptedAt` được lấy ngay trước transaction. Trong lúc DB chạy, clock tiếp tục nhưng move, resign, draw response, item khác và timeout không được vượt qua action pending. Sau commit server cài plan RAM, tăng gameplay revision, lập timer và phân xử deadline đã trôi. Disconnect không hủy action đã được chấp nhận.

Cùng `(matchId, accountId, requestId)` và fingerprint trả kết quả cũ. Khác payload hoặc action trả conflict. RequestId cũng không được tái sử dụng giữa item và move/resign/draw hoặc giao thức V1.

## Active effects và vòng đời

Effect công khai giữ effect/item code, source side, target piece, `acceptedAt`, `startTurnSequence`, `expiresAfterTurnSequence` và status. `turnSequence` chỉ tăng khi đi quân, độc lập stateVersion. Khiên và Phong ấn bắt đầu ngay, tồn tại trong nước đi còn lại của người dùng và trọn lượt kế tiếp của đối thủ, rồi hết cuối lượt đó. Capture xóa effects của quân bị ăn; Hồi sinh trả quân sạch.

Rules nhận effects trong kiểm tra chiếu, nước hợp lệ và liệt kê nước. Khiên chặn mọi nước ăn nhắm vào mục tiêu. Phong ấn cấm quân di chuyển/ăn và loại quân khỏi vùng tấn công, nhưng vị trí quân vẫn chặn Xe, Pháo, Mã hoặc Tượng theo hình học bình thường.

## Mười hiệu ứng

| Code | Hành vi server |
|---|---|
| `scout` | Trả riêng các đích hợp lệ của một quân địch nếu địch được đi tại state hiện tại; rỗng vẫn thành công. |
| `time_saver` | Mở cửa sổ 10.000 ms; nước hợp lệ kế tiếp cùng lượt được hoàn phần giờ tổng đã trôi, tối đa quỹ ban đầu. |
| `unseal` | Gỡ Phong ấn khỏi quân mình; Khiên vẫn giữ. |
| `shield_breaker` | Gỡ Khiên khỏi quân địch; Phong ấn vẫn giữ. |
| `time_pressure` | Trừ `min(15 giây, phần vượt 10 giây)` khỏi quỹ tổng đối thủ; không đổi giờ lượt. |
| `time_extension` | Cộng tối đa 30 giây tổng của mình, không vượt quỹ ban đầu; phải cộng được ít nhất 1 ms. |
| `calm` | Cộng 15 giây vào hạn lượt hiện tại; tổng không đổi và lượt sau trở lại 60 giây. |
| `shield` | Bảo vệ quân mình không phải Tướng khỏi bị ăn; quân vẫn đi và tấn công. |
| `seal` | Vô hiệu di chuyển, ăn và tấn công của quân địch không phải Tướng; quân vẫn đứng và có thể bị ăn. |
| `revive` | Đưa đúng quân mình đã mất, trừ Tướng, về ô khai cuộc nếu trống và Tướng an toàn ngay sau đó. |

## Chiếu bí, snapshot và riêng tư

Sau nước đi, server xử lý capture/effect expiry rồi tính chiếu. Nếu không còn nước thường, server mô phỏng một item chưa dùng trong snapshot; không tiêu hao và không công khai việc có món cứu. Không tìm chuỗi hai item. Không có nước và không có item cứu thì bên tới lượt thua: `checkmate` khi đang bị chiếu, `stalemate` khi không bị chiếu.

Snapshot công khai thêm `turnSequence`, `activeEffects` và `usedItems`. Snapshot riêng thêm `ownLoadout` đã lọc món dùng, `ownUsedItems`, `ownScout` và `ownPendingItem`. Mục tiêu/kết quả Trinh sát không nằm trong lịch sử công khai. Bàn, active effects, item đã công khai và clock vẫn được gửi cho cả hai.

Reconnect dùng lại trạng thái RAM, không reset item/effect/cửa sổ/clock. Restart giữ chính sách cũ: trận RAM mất, wager recovery chạy như trước, usage đã commit vẫn tiêu hao và không tự hoàn.

## Checklist frontend và tự thử

Frontend cần thêm parser/ack/error cho `match:item:use`, modal xác nhận, bộ chọn mục tiêu, hiển thị effect/hạn, own loadout đã dùng, kết quả Trinh sát riêng và pending action. Countdown tiếp tục dựa trên `serverNow`/deadline; client không tự chốt effect, giờ hoặc kết quả.

Tự thử với hai tài khoản: bật item, mỗi bên chọn 0–3 loại, ready, xác nhận chỉ thấy own loadout; dùng Trinh sát và kiểm tra đối thủ không thấy mục tiêu/kết quả; retry cùng request; thử Khiên/Phong ấn qua một lượt đối thủ; thử item giờ sát deadline; reconnect và lấy snapshot; kết thúc bằng checkmate/stalemate có và không có item cứu. Không gửi access token, seat token hoặc credential vào log.
