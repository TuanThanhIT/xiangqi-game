# Backend lịch sử đấu và lịch sử ví

## Phạm vi

Backend lưu bền vững các trận Giải trí mới bắt đầu sau migration 0008. Không backfill trận cũ, replay, friends, chat, loadout chưa dùng hoặc kết quả Trinh sát. Participant chỉ xem trận của chính mình; người ngoài nhận 404 thống nhất.

## Lifecycle và recovery

Khi bắt đầu, server tạo `matchId`, snapshot hai participant, nickname/avatar, room/theme, time control, items và stake rồi ghi `match_history` cùng `match_history_participants` trong một transaction. Chỉ sau commit, trận mới được tạo trong RAM và broadcast. Retry cùng identity là no-op; payload khác bị conflict.

Khi có terminal result, server chuẩn hóa final board, capture và item usage thành công rồi finalize history idempotent trước wager, reward và mission. Các side effect tiếp tục độc lập theo `matchId`; trạng thái `wagerStatus`, `rewardStatus`, `missionStatus` được đối chiếu sau xử lý và khi startup recovery. Đọc history không chạy side effect.

Startup đổi active record chưa có hoạt động thành `cancelled/start_aborted` và ẩn khỏi danh sách. Record đã có move/item thành `cancelled/backend_restart`, `detailLevel=partial`, `finalBoard=null`. Không suy đoán winner hoặc board.

## Schema

- `match_history`: identity, participant IDs, result, thời gian, settings snapshot, activity, final board và trạng thái side effect.
- `match_history_participants`: ID riêng để account có thể nullable trong tương lai; side/profile snapshot, outcome, capture/item và tài chính riêng của participant.
- Cursor list dựa trên `(endedAt, matchId)`; index participant `(accountId, endedAt, matchId)` giữ thứ tự ổn định.
- Migration `0008_futuristic_romulus.sql` chỉ tạo schema mới, không backfill và không sửa migration 0000–0007.

Final board chỉ gồm `{pieceId,type,side,row,col}`. Item summary chỉ gồm code đã dùng thành công. Không lưu/trả request ID, fingerprint, loadout chưa dùng, Scout, inventory, token hoặc metadata nội bộ.

## API lịch sử đấu

`GET /match-history` yêu cầu đăng nhập. Query: `cursor`, `limit` 1–100, `mode`, `result=win|loss|draw|cancelled`, `reason`, `from`, `to`. Ngày là `YYYY-MM-DD` cố định theo `Asia/Ho_Chi_Minh`; from inclusive, to inclusive bằng cận `< ngày kế tiếp`. Active và cancelled không hoạt động không được trả.

`GET /match-history/:matchId` chỉ cho participant; không tồn tại/không có quyền đều trả 404. Detail trả snapshot hai bên, settings, board nếu có, summaries và trạng thái side effect. Dữ liệu cược/reward riêng chỉ theo viewer. Friends authorization nối sau.

## Wallet history chuẩn hóa

`GET /wallet/history` giữ cursor `before=entryNo`, `limit` 1–100 và thêm `category=wager|purchase|reward|grant`, `type`, `from`, `to`. Account luôn lấy từ AuthGuard.

Mỗi entry trả `entryNo`, type/category, available/held delta, `netAmount`, direction, balance-after, title/description code, occurredAt, reference và details allowlist. Không trả `accountId`, `operationKey` hoặc metadata thô.

| Type | Category | Direction/details |
|---|---|---|
| starter_grant | grant | credit |
| bet_hold/refund | wager | transfer, stake/released stake |
| bet_payout | wager | net profit hoặc net loss; gross payout chỉ ở details |
| item_purchase | purchase | item code/name, quantity và giá từ purchase/catalog |
| casual_match_win_reward | reward | match reference |
| check-in/bonus | reward | local date, cycle day, reward type |
| mission_reward | reward | mission code/category/period/amount |

## Kiểm thử và checklist frontend

`test:history` chạy migration 0000–0008 hai lần trong PostgreSQL schema ngẫu nhiên, kiểm tra start/finalize idempotency và conflict, board/summaries, snapshot, privacy, recovery, filter ngày Việt Nam và wallet DTO. Hồi quy match/clock/wallet/reward/check-in/missions/items/Auth/OTP vẫn bắt buộc.

Frontend sau này dùng cursor server, code title/description để dịch, không đọc metadata thô; hiển thị `netAmount` làm số chính và delta để giải thích hold/refund; không suy luận dữ liệu bị thiếu ở record partial. Friends chỉ được nối sau khi có quan hệ bạn bè bền vững.
