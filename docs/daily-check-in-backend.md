# Điểm danh hằng ngày — backend

Điểm danh là tính năng toàn tài khoản. Backend xác định account từ access token, xác định ngày bằng đồng hồ server và không nhận accountId, ngày, timezone, cycleDay hoặc số vàng từ client.

## Chính sách 30 ngày

- Mỗi local date nhận 20 vàng.
- CycleDay 7, 14, 21 và 28 nhận thêm 50 vàng.
- CycleDay 30 nhận thêm 200 vàng, không nhận bonus 50.
- Một chu kỳ đủ 30 ngày nhận `30 × 20 + 4 × 50 + 200 = 1.000` vàng.
- Ngày liên tiếp sau cycleDay 30 quay về cycleDay 1 nhưng `consecutiveDays` tiếp tục tăng.
- Bỏ lỡ ít nhất một local date làm cycleDay và consecutiveDays của claim kế tiếp về 1.
- Chu kỳ không phụ thuộc tháng dương lịch.

## Múi giờ và ranh giới ngày

Timezone cố định là `Asia/Ho_Chi_Minh` (UTC+07:00). Mỗi request capture đúng một mốc `now`; từ mốc đó tính `localDate` và 00:00 tiếp theo. Timestamp lưu UTC, localDate lưu kiểu PostgreSQL `date`. So sánh chuỗi bằng local date, không dùng khoảng cách số giờ. `nextResetAt` trả ISO UTC kèm trường timezone trong status.

## Schema và transaction

Migration `0006_peaceful_mongoose.sql` tạo `daily_check_ins` với claim ID, account, localDate, cycleDay, consecutiveDays, ba thành phần reward, tổng, số dư sau claim, wallet entry numbers và claimedAt. Unique `(account_id, local_date)` là lớp idempotency cuối; index `(account_id, local_date)` phục vụ lấy claim mới nhất. Check constraints giới hạn cycleDay 1–30, reward không âm/tổng đúng và entry liên tiếp.

Transaction claim:

1. Capture server time và localDate một lần.
2. Lấy PostgreSQL advisory transaction lock theo account.
3. Nếu đã có claim cùng ngày, trả đúng kết quả cũ.
4. Đọc claim gần nhất, tính cycleDay/consecutiveDays và reward.
5. Khóa ví, tạo claim, cập nhật availableGold và version.
6. Ghi mọi wallet entry rồi commit.
7. Chỉ trả walletBalance sau commit.

Rollback không để lại claim, số dư hoặc ledger. Retry đồng thời và retry sau mất response trả cùng claim, không cộng lại. Held gold không thay đổi.

## Wallet entries

- `daily_check_in_reward`: 20 vàng mỗi claim.
- `check_in_7_day_bonus`: 50 vàng tại ngày 7/14/21/28.
- `check_in_30_day_bonus`: 200 vàng tại ngày 30.

Daily và milestone là các entry riêng trong cùng transaction. `check_in_id` tham chiếu claim; metadata chứa localDate, cycleDay, `daily_check_in_v1` và rewardType. Các loại ledger cũ dùng metadata rỗng mặc định.

## API

`GET /check-in` yêu cầu đăng nhập, trả serverDate, timezone, claimedToday, canClaim, cycle hiện tại/kế tiếp, consecutiveDays, lastClaimedDate, nextResetAt, milestones và claim hôm nay nếu có.

`POST /check-in/claim` yêu cầu body rỗng `{}`. Response gồm checkInId, localDate, cycleDay, consecutiveDays, reward components, totalReward, walletBalance, claimedAt và nextResetAt. Trường thừa bị từ chối; không có API claim thay tài khoản.

## Kiểm thử và frontend sau này

`test:check-in` dùng PostgreSQL schema ngẫu nhiên, fake clock, chạy migration 0000–0006 hai lần bằng journal riêng. Ma trận gồm đủ chu kỳ, milestones, wrap, đứt chuỗi, retry đồng thời/mất response, rollback, held gold, 23:59:59/00:00, tháng/năm/năm nhuận và Auth/payload giả.

Frontend cần gọi API cùng origin, hiển thị countdown từ `nextResetAt`, chu kỳ/mốc thưởng và lịch sử ví; không tự tính eligibility hoặc gửi ngày/số vàng. Lượt backend này không sửa frontend và chưa áp migration 0006 lên development.

Chạy:

```powershell
npm.cmd run test:check-in --workspace=@xiangqi/server
npm.cmd run test:wallet --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
```
