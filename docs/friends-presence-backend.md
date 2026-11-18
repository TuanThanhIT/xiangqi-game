# Backend Friends, presence và lời mời phòng

## Phạm vi và giới hạn

V1 hỗ trợ tìm chính xác nickname, lời mời kết bạn, danh sách bạn, hủy bạn, block, presence một instance, lời mời phòng RAM và quyền bạn bè xem chi tiết trận. Không có fuzzy search, last-seen, chat, Redis, notification ngoài Socket.IO hay quyền xem danh sách lịch sử/ví/kho của bạn bè. Restart làm toàn bộ presence và room invite thành offline/hết hiệu lực.

## Schema và trạng thái

Migration `0009_light_lady_mastermind.sql` tạo `friendships`, `friend_requests`, `user_blocks`; không sửa hoặc backfill migration cũ. Friendship dùng cặp UUID canonical `accountLowId < accountHighId`, unique một cặp. Request giữ lịch sử để áp cửa sổ 10 request/giờ và có trạng thái `pending → accepted|rejected|cancelled|invalidated`; partial unique index chỉ cho một pending mỗi cặp bất kể chiều. Block có hướng và unique theo blocker/blocked. FK account không cascade để không âm thầm xóa audit.

Các mutation cặp tài khoản dùng transaction và advisory lock theo hai UUID đã sắp thứ tự. Reciprocal send tự accept; accept kiểm tra lại block và giới hạn 100 bạn của cả hai. Giới hạn khác: 30 outgoing pending và 10 request mới/cửa sổ trượt một giờ. Retry cùng pending trả record cũ; unique/check constraint là lớp bảo vệ cuối.

Block xóa friendship, invalidates pending request hai chiều và thông báo cho lớp room invite. Unblock không phục hồi dữ liệu cũ. Search/block/history đều dùng lỗi chung, không công khai ai block ai.

## HTTP

- `GET /players/search?nickname=`: exact nicknameKey; không trả email; presence chỉ khi đã là bạn.
- `GET /friends`, `GET /friends/requests?direction=incoming|outgoing`.
- `POST /friends/requests`, `POST .../:id/accept`, `POST .../:id/reject`, `DELETE .../:id`.
- `DELETE /friends/:accountId`.
- `GET /blocks`, `POST /blocks/:accountId`, `DELETE /blocks/:accountId`.

Mọi identity lấy từ AuthGuard. POST/DELETE áp OriginGuard theo convention hiện hành. Client không gửi sender/account owner.

## Presence và Socket.IO

Namespace `/friends` chỉ nhận `{accessToken}` và xóa token khỏi handshake sau xác thực. Một account online nếu còn ít nhất một socket; socket cuối disconnect bắt đầu grace 30 giây, reconnect hủy timer. `PresenceClock` injectable cho test. Activity được lấy qua boundary chỉ đọc của RoomsService: `available`, `waiting_room`, `in_match`; offline trả `unknown`.

Event: `friends:presence:snapshot`, `friends:presence:changed`, `friends:relationship:changed`, cùng nhóm `friends:room-invite:*`. Event chỉ gửi room nội bộ `account:<id>`, không broadcast server. Reconnect luôn nhận snapshot mới.

## Room invite

Invite ở RAM, sống 60 giây; cooldown host-target 15 giây; tối đa 5 pending/host; requestId idempotent. Chỉ host của phòng waiting có ghế trống được mời current friend đang online/available. Accept kiểm tra lại friendship, block, expiry, phòng, ghế và trạng thái target rồi dùng chính `joinCasual`, không tự ready. Room đóng/đầy/bắt đầu, target offline sau grace, unfriend hoặc block làm invite invalidated. Restart xóa invite.

## History authorization và privacy

Participant giữ DTO hiện tại. Current friend của ít nhất một participant được xem gameplay-only detail tại thời điểm request. Kết bạn sau trận cho phép xem; unfriend/block thu hồi ngay; ngoài quyền nhận 404. Friend DTO có result/reason, snapshot nickname/avatar, board, capture, item code đã dùng, time/theme/items và `hasWager`; không có stake/net delta/reward/side effects, wallet, inventory, loadout, Scout hay metadata idempotency.

| Dữ liệu | Chính chủ | Bạn hiện tại | Người ngoài |
|---|---:|---:|---:|
| Danh sách bạn + presence | Có | Không | Không |
| Match detail gameplay | Có | Có | Không |
| Tài chính riêng trong match | Có | Không | Không |
| Wallet/inventory/loadout/Scout | Theo API chính chủ | Không | Không |
| Trạng thái block | Danh sách mình block | Không | Không |

## Kiểm thử và frontend checklist

`test:friends` chạy migration 0000–0009 hai lần trong PostgreSQL schema riêng, kiểm tra exact search, reciprocal/idempotency, authorization, unfriend/block/unblock, canonical constraint và fake-clock presence. `test:history` kiểm tra friend gameplay DTO và thu hồi quyền. Hồi quy backend/room/match/wallet/reward/check-in/missions/items/Auth/OTP vẫn bắt buộc.

Frontend sau này cần proxy cùng origin cho HTTP, mở namespace `/friends` bằng access token trong RAM, thay snapshot khi reconnect, không tự suy ra block từ lỗi chung, giữ `requestId` cho retry create invite, và không hiển thị activity khi offline.
