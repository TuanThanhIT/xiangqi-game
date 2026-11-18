# Backend chat và emote trong trận Giải trí

## Phạm vi và vòng đời

Chat dùng namespace `/rooms` hiện có và chỉ tồn tại trong RAM theo `matchId`. Chat mở khi trận thật sự bắt đầu, đóng ngay khi server chốt bất kỳ kết quả terminal nào, và bị thu hồi cùng `MatchSession`. Restart backend làm mất buffer và idempotency record; V1 không lưu PostgreSQL, không có Redis, moderation/report, push notification hay mute phía server.

Chỉ socket đã xác thực và hiện còn sở hữu ghế của một trong hai participant được gửi hoặc đọc snapshot. Namespace `/rooms` giữ contract hiện tại là mỗi ghế chỉ có một socket chủ động: mở tab/kết nối mới sẽ thay và ngắt socket cũ, không hỗ trợ đồng thời nhiều tab cho cùng ghế. Không có chat tại sảnh/phòng chờ, spectator, trận khác hay sau terminal. Chat không thay đổi version, lượt, đồng hồ, kết quả, wager, reward, mission hoặc item state. Terminal action và chat send được quyết định đồng bộ qua `RoomsService`; thứ tự server xử lý quyết định request nào thắng khi chúng đến đồng thời.

## Socket.IO protocol

| Hướng | Event | Payload/kết quả |
|---|---|---|
| Client → server | `match:chat:send` | Union text/emote strict; ack thành công hoặc error code |
| Client → server | `match:chat:snapshot` | `{ matchId }`; trả snapshot công khai của đúng trận |
| Server → client | `match:chat:message` | Một `MatchChatMessage` đã được chấp nhận |
| Server → client | `match:chat:closed` | `{ matchId, closedAt, reason }` |

Client gửi:

- `match:chat:send` với đúng một trong hai payload:
  - `{ matchId, requestId, kind: "text", text }`
  - `{ matchId, requestId, kind: "emote", emoteCode }`
- `match:chat:snapshot` với đúng `{ matchId }`.

Server phát cho các participant còn giữ socket hợp lệ:

- `match:chat:message`: message công khai đã được server chấp nhận.
- `match:chat:closed`: `{ matchId, closedAt, reason }`, đúng một lần trong vòng đời session.

Ack send thành công là `{ ok: true, requestId, message, replayed }`. Message gồm UUID do server tạo, `matchId`, sequence tăng đơn điệu, `senderSide`, `kind`, nội dung tương ứng và `sentAt` epoch milliseconds. Snapshot thành công trả `{ matchId, open, messages, latestSequence, emoteCodes, serverNow }`, tối đa 20 message gần nhất.

`requestId` dài 1–128 ký tự và chỉ dùng chữ, số, `.`, `_`, `:`, `-`. Idempotency được phân vùng theo account + requestId trong đúng trận. Retry cùng payload trả message cũ với `replayed: true`, không phát lại và không tính rate limit; dùng lại ID với payload khác trả `CHAT_REQUEST_ID_CONFLICT`. Record được giữ hết vòng đời trận dù message đã rời buffer.

## Nội dung và giới hạn

Text được trim, gộp mọi khoảng trắng/newline liên tiếp thành một dấu cách, phải còn nội dung và tối đa 120 Unicode code point. Control character không phù hợp bị từ chối; server chỉ giữ plain text. Emote allowlist cố định:

`HELLO`, `GOOD_LUCK`, `NICE_MOVE`, `THINKING`, `SURPRISED`, `GG`, `THANKS`, `SORRY`.

Mỗi account trong mỗi trận được tối đa một message thành công mỗi 1.000 ms và 20 message trong cửa sổ trượt 60.000 ms. `CHAT_RATE_LIMITED` kèm `retryAfterMs` là thời gian chờ lớn nhất còn lại của hai giới hạn. Validation/auth/conflict/retry không tiêu quota. Không có timer theo message; cửa sổ được dọn khi request tiếp theo đến.

Các error code mới: `INVALID_CHAT_REQUEST`, `CHAT_NOT_AVAILABLE`, `CHAT_FORBIDDEN`, `CHAT_RATE_LIMITED`, `CHAT_REQUEST_ID_CONFLICT`, `INVALID_CHAT_TEXT`, `INVALID_CHAT_EMOTE`.

## Kiểm thử và giới hạn V1

`npm.cmd run test:chat --workspace=@xiangqi/server` kiểm tra parser strict, chuẩn hóa Unicode, allowlist, buffer, idempotency sau eviction, conflict, hai rate limit bằng fake clock, phân vùng quota, snapshot, authorization và đóng terminal đúng một lần. Frontend sau này tự mute bằng lọc hiển thị cục bộ; backend vẫn nhận và phân phối message hợp lệ. Kiến trúc một instance hiện chỉ phát cho socket hợp lệ trên instance đó.

Checklist frontend: dùng cùng namespace `/rooms`; giữ `requestId` khi retry; render text bằng text node/escaping của React và tuyệt đối không dùng `dangerouslySetInnerHTML`; ánh xạ tám emote sang asset nội bộ; thay buffer bằng snapshot khi reconnect; sắp theo sequence; dùng `retryAfterMs` để khóa tạm nút gửi; ngừng gửi khi nhận `match:chat:closed`. Mute được lưu như preference cục bộ: không render/không phát âm thanh, không báo cho đối thủ và không thay đổi rate limit phía server.
