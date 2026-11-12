# Thưởng thắng trận Giải trí — backend

Backend tự cộng 5 vàng cho người thắng một trận Giải trí hợp lệ. Client không gửi người thắng, reason, amount hoặc yêu cầu nhận thưởng. Reward độc lập với wager và không thay đổi vàng đang giữ.

## Eligibility và mapping reason

| Result bền vững | Reward |
| --- | --- |
| `finished/checkmate` | Người thắng +5 |
| `finished/stalemate` | Người thắng +5 |
| `finished/total_timeout` | Người thắng +5 |
| `finished/turn_timeout` | Người thắng +5 |
| `finished/resignation` | Người thắng +5 |
| `finished/disconnect_timeout` | Không thưởng |
| `draw/agreement` | Không thưởng |
| `cancelled/both_disconnected` | Không thưởng |
| recovery hủy trận chưa có kết quả bền vững | Không tạo result/reward |
| reason khác allowlist | Không thưởng |

Tên domain hiện tại `disconnect_timeout` tương ứng `disconnect_forfeit` trong yêu cầu nghiệp vụ. Không suy luận từ message tiếng Việt và không đổi reason socket cũ.

## Persistence, transaction và retry

Migration `0005_secret_sabretooth.sql` tạo `casual_match_results`. Một hàng chốt `matchId`, hai tài khoản, result/reason, winner, policy `casual_win_reward_v1`, amount 5 và trạng thái `pending`, `credited` hoặc `not_eligible`. Unique idempotency key có dạng `casual_win_reward_v1:<matchId>:<winnerAccountId>`; database constraint bảo đảm mỗi policy/match/winner chỉ có một reward.

Kết thúc trận xử lý theo thứ tự:

1. Match engine chốt result trong RAM đúng một lần.
2. `MatchRewardService.record` insert/đối chiếu result bền vững; result khác cho cùng match bị `MATCH_RESULT_CONFLICT`.
3. Wager ghi result và quyết toán theo transaction riêng nếu phòng có cược.
4. Reward hợp lệ khóa hàng result và ví người thắng; cộng 5, ghi `wallet_entries.reason = casual_match_win_reward`, rồi chuyển result sang `credited` trong cùng transaction.
5. Snapshot chỉ báo `credited` sau commit. Lỗi DB giữ `pending`; retry/restart đọc pending và tiếp tục.

Nếu response bị mất sau commit, retry khóa lại hàng result và thấy `credited`, không cộng lần hai. Rollback không đổi ví, ledger hoặc trạng thái credit. Startup recovery chạy sau khi backend giữ advisory lock và sau wager recovery; chỉ retry các result reward đang `pending`. Trận RAM bị mất trước khi có result bền vững không được thưởng.

## Tách biệt wager và quyền riêng tư

Wager vẫn dùng `wagers` và các entry `bet_hold/bet_payout/bet_refund`. Reward dùng entry riêng, FK `reward_match_id`, không gộp vào payout và vẫn chạy cho phòng stake 0. Lỗi một nghiệp vụ không làm nghiệp vụ kia lặp; RoomsService retry từng trạng thái còn thiếu.

Snapshot kết quả thêm `reward: { eligible, amount, status }`. `walletBalance` chỉ có khi reward đã credited và socket đang xem thuộc tài khoản người nhận. Đối thủ không nhận số dư ví. Không có endpoint credit reward công khai.

## Migration và kiểm thử

Không sửa migration 0000–0004. Test reward tạo schema PostgreSQL ngẫu nhiên, chuyển các FK `public` sang schema test, chạy migration 0000–0005 hai lần qua journal riêng và xác nhận đúng 6 bản ghi. Development database chưa tự động áp dụng 0005 trong lượt này.

Chạy:

```powershell
npm.cmd run test:reward --workspace=@xiangqi/server
npm.cmd run test:wallet --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
```

Tự thử sau khi chủ động migrate development: đăng nhập hai tài khoản đã xác minh, tạo phòng stake 0 hoặc có cược, kết thúc bằng từng reason trong bảng, rồi kiểm tra snapshot reward, `GET /wallet` và `GET /wallet/history`. Retry cùng action/result không được sinh entry thứ hai. Không gửi token, OTP hoặc DATABASE_URL vào log.
