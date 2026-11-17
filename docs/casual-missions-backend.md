# Backend nhiệm vụ Giải trí

## Phạm vi và catalog

Backend cung cấp nhiệm vụ dùng chung theo tài khoản, không có nhiệm vụ ranked. Catalog `mission_definitions` là nguồn sự thật phía server, được seed idempotent trong migration 0007 với version 1.

| Nhóm | Code | Metric | Target | Vàng |
|---|---|---|---:|---:|
| Daily | daily_complete_1 | completed_matches | 1 | 5 |
| Daily | daily_complete_3 | completed_matches | 3 | 10 |
| Daily | daily_win_1 | wins | 1 | 10 |
| Daily | daily_capture_5 | captures | 5 | 5 |
| Daily | daily_capture_cannon | cannon_captures | 1 | 5 |
| Daily | daily_use_item | item_usages | 1 | 5 |
| Daily | daily_win_without_item | win_without_item | 1 | 10 |
| Weekly | weekly_complete_10 | completed_matches | 10 | 25 |
| Weekly | weekly_complete_20 | completed_matches | 20 | 40 |
| Weekly | weekly_win_5 | wins | 5 | 30 |
| Weekly | weekly_win_10 | wins | 10 | 50 |
| Weekly | weekly_capture_40 | captures | 40 | 25 |
| Weekly | weekly_capture_100 | captures | 100 | 50 |
| Weekly | weekly_use_item_10 | item_usages | 10 | 30 |
| Weekly | weekly_win_no_item_3 | win_without_item | 3 | 30 |
| Achievement | achievement_first_win | wins | 1 | 20 |
| Achievement | achievement_complete_10 | completed_matches | 10 | 30 |
| Achievement | achievement_complete_50 | completed_matches | 50 | 80 |
| Achievement | achievement_complete_100 | completed_matches | 100 | 150 |
| Achievement | achievement_win_10 | wins | 10 | 50 |
| Achievement | achievement_win_50 | wins | 50 | 120 |
| Achievement | achievement_win_100 | wins | 100 | 250 |
| Achievement | achievement_capture_100 | captures | 100 | 50 |
| Achievement | achievement_capture_500 | captures | 500 | 200 |
| Achievement | achievement_use_item_50 | item_usages | 50 | 100 |

## Eligibility và contribution summary

| Kết quả | Completed | Win | Capture/item |
|---|---|---|---|
| checkmate, stalemate, total_timeout, turn_timeout | Cả hai | Người thắng | Cả hai |
| resignation | Chỉ người thắng | Người thắng | Chỉ người thắng |
| draw agreement | Cả hai | Không | Cả hai |
| disconnect_timeout | Không | Không | Không |
| cancelled/recovery/administrative | Không | Không | Không |

Trong RAM, match engine giữ capture history riêng với danh sách quân đang bị bắt. Vì vậy quân được Hồi sinh rồi bị ăn lại tạo thêm một capture; Pháo bị ăn lại cũng tăng cannon capture. Item contribution lấy từ item history chỉ sau transaction consume thành công. Request bị từ chối hoặc rollback không vào history. `wonWithoutItem` chỉ xét người thắng và item history của chính họ.

Khi kết quả được server chốt, một `resultAt` duy nhất được capture. `mission_contributions` lưu summary của từng tài khoản với khóa `(match_id, account_id, version)`. Summary được ghi trước settlement tài chính, trạng thái `applied_at` chỉ có sau khi progress được cập nhật. Retry, mất response, worker trùng và restart đối soát bằng khóa DB; `MissionService.recover()` áp lại các contribution chưa applied sau khi wager và match reward recovery hoàn tất.

## Schema và period

- `mission_definitions`: code, category, metric, target, reward, active, version và display order.
- `mission_contributions`: bằng chứng kết quả và các delta theo account/match/version.
- `mission_progress`: unique account + mission + period; lưu progress nền, target/reward snapshot, status và ledger reference.
- `wallet_entries.mission_progress_id`: reference bắt buộc cho reason `mission_reward`.

Timezone cố định `Asia/Ho_Chi_Minh`. Daily key là local date. Weekly key là ngày thứ Hai mở đầu tuần. Achievement dùng `lifetime`. Period dựa trên `resultAt` phía server. Progress API được cap ở target nhưng counter DB có thể lớn hơn. Daily/weekly cũ ở trạng thái in_progress/completed được chuyển thành expired khi tài khoản đọc hoặc claim period mới; không carry phần dư. Achievement không hết hạn.

## Claim transaction

`POST /missions/:code/claim` dùng account từ AuthGuard, body rỗng và code từ route. Transaction khóa advisory theo account, expire period cũ, khóa progress và wallet, kiểm tra definition/status/period, lấy reward snapshot, cộng available gold, ghi một ledger `mission_reward`, rồi đổi progress sang claimed. Held gold không đổi. Operation key theo progress ID bảo vệ retry bền vững; claim đồng thời chỉ một request thành công, request sau nhận `mission_already_claimed`.

Metadata ledger gồm `missionCode`, `category`, `periodKey`, `definitionVersion`, `progressId` và `rewardAmount`. Reward nhiệm vụ độc lập với wager, thưởng thắng và điểm danh.

## API và lỗi

- `GET /missions?category=daily|weekly|achievement|all`: chỉ dữ liệu tài khoản hiện tại, serverTime, timezone, daily/weekly reset và danh sách progress.
- `POST /missions/:code/claim`: body `{}`, trả reward, trạng thái claimed, số dư mới và claimedAt của chính tài khoản.

Mã lỗi ổn định: `mission_not_found`, `mission_inactive`, `mission_not_completed`, `mission_expired`, `mission_already_claimed`, `mission_claim_conflict`, `invalid_mission_category`. Không có endpoint nhận event/progress/result/amount từ client.

## Test matrix

Test PostgreSQL biệt lập chạy migration hai lần, kiểm tra 25 catalog, seed/journal idempotency, shared metrics, daily reset, ranh giới Chủ nhật–thứ Hai, lifetime accumulation, toàn bộ result reason, capture/Pháo hồi sinh, item success/reject semantics, duplicate/concurrent contribution, claim concurrent/rollback/retry, held gold, mốc 00:00 Việt Nam, API auth và forged fields. Hồi quy gồm match, clock, wallet, reward, check-in, items, Auth và OTP.

## Checklist frontend sau này

- Chỉ dùng dữ liệu catalog/progress từ API; không tự tính reward hoặc period.
- Hiển thị tab daily/weekly/achievement và trạng thái in_progress/completed/claimed/expired.
- Dùng reset timestamp của server và timezone trả về.
- Claim bằng body rỗng, không tự retry POST; xử lý mã lỗi ổn định bằng toast.
- Chỉ cập nhật số dư từ response claim thành công của chính người dùng.
