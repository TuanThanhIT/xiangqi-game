# Audit đóng backend V1 — chế độ Giải trí

Ngày audit ban đầu: 2026-11-18; cập nhật blocker OTP: 2026-11-19. Audit ban đầu là chỉ đọc; lượt cập nhật chỉ sửa boundary registration OTP, regression test và hai tài liệu liên quan, không sửa migration hay frontend.

## 1. Phạm vi và kết luận

- Branch `master`, HEAD `167c2d93e1e3fc7eae22f2510ab938d40078ccb5`, so với `origin/master`: ahead 13, behind 0.
- Database development: `xiangqi_dev`; role: `xiangqi_app`; migration mới nhất `0009`; journal 10 bản ghi.
- Backend V1 đủ hợp đồng để frontend bắt đầu tích hợp theo source hiện tại.
- Blocker SMTP-in-transaction của registration đã được xử lý bằng reserve → gửi ngoài transaction → activate và regression test deferred-mailer. Chưa nên tuyên bố sẵn sàng production cho tới khi nghiệm thu SMTP thật; ngoài ra runtime phòng/trận/presence/invite/chat chỉ hỗ trợ một instance và mất trạng thái RAM khi restart.
- Không có migration mới. Schema Drizzle và chuỗi migration 0000–0009 được các bộ integration áp lại trong schema biệt lập và `db:check`/`db:verify` xác nhận trên development.
- Ba thay đổi frontend có sẵn được giữ nguyên, không thuộc audit: `apps/web/next-env.d.ts`, `waiting-desktop.png`, `waiting-mobile.png`.

## 2. Ma trận chức năng V1

Quy ước: **Implemented** có code chạy; **Tested** có test tự động trong lượt audit; **Documented** có tài liệu backend/contract; **Frontend pending** chưa nối UI; **Deferred/Out of V1** không thuộc backend V1 này.

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| Đăng ký, OTP xác minh, đăng nhập, refresh, logout, `/me` | Implemented · Tested · Documented · Frontend hiện có một phần | Access JWT 15 phút; refresh session cố định 7 ngày; Origin guard ở mutation cookie/auth. |
| Hồ sơ, đổi nickname, chọn avatar | Implemented · Tested · Documented · Frontend pending | Nickname cooldown 30 ngày; avatar chỉ từ catalog DB. |
| Quên/đặt lại mật khẩu | Implemented · Tested · Documented · Frontend pending | Generic request chống enumeration; OTP một lần; revoke mọi refresh session. |
| Phòng legacy/local online | Implemented · Tested · Documented | Hợp đồng V1 cũ vẫn tồn tại song song casual account-bound. |
| Phòng chờ casual, ready, reconnect ghế | Implemented · Tested · Documented · Frontend pending | Một socket chủ động mỗi ghế; grace 60 giây. |
| Đồng hồ server-authoritative | Implemented · Tested · Documented · Frontend pending | Tổng 5/10/15/20/30 phút, lượt 60 giây, deadline tuyệt đối. |
| Match, move, resign, draw, check/checkmate/stalemate | Implemented · Tested · Documented · Frontend pending | Server quyết định bàn, lượt, deadline và kết quả. |
| Cửa hàng, kho, loadout | Implemented · Tested · Documented · Frontend pending | Catalog 10 món; loadout riêng tư; trang bị không tiêu hao. |
| 10 hiệu ứng vật phẩm và tiêu hao | Implemented · Tested · Documented · Frontend pending | Item action idempotent; Trinh sát riêng tư; cứu chiếu bí được mô phỏng server-side. |
| Ví, cược, quyết toán và recovery | Implemented · Tested · Documented · Frontend pending | Ledger/hold/payout/refund trong transaction; startup recovery một instance. |
| Thưởng thắng casual 5 vàng | Implemented · Tested · Documented · Frontend pending | Tách khỏi wager; chỉ reason đủ điều kiện; idempotent theo match. |
| Điểm danh 30 ngày | Implemented · Tested · Documented · Frontend pending | Múi giờ `Asia/Ho_Chi_Minh`; retry/concurrency không cộng hai lần. |
| 25 nhiệm vụ và claim | Implemented · Tested · Documented · Frontend pending | 7 daily, 8 weekly, 10 achievement; contribution chỉ từ kết quả server. |
| Lịch sử trận và lịch sử ví | Implemented · Tested · Documented · Frontend pending | Cursor/filter; participant riêng tư; DTO ví không trả metadata thô. |
| Friends, block, presence, room invite | Implemented · Tested · Documented · Frontend pending | Presence/invite RAM một instance; friend history gameplay-only. |
| Chat chữ và 8 emote trong trận | Implemented · Tested · Documented · Frontend pending | RAM, buffer 20, rate limit, đóng khi terminal. |
| Mute chat | Frontend pending | Chỉ là preference/lọc cục bộ; không có API server. |
| Chat sảnh/bạn bè, spectator, report/moderation, last-seen, push | Deferred/Out of V1 | Không có hợp đồng backend. |
| Ranked, bot, leaderboard, replay, repetition/perpetual check | Deferred/Out of V1 | Cần đặc tả riêng. |
| Redis, nhiều backend instance, phục hồi bàn active sau restart | Deferred/Out of V1 | Runtime hiện được bảo vệ bằng advisory lock một instance. |

## 3. Inventory HTTP

Source hiện có **49 endpoint HTTP**.

| Nhóm | Endpoint |
|---|---|
| Health | `GET /health` |
| Auth/session | `POST /auth/login`; `POST /auth/refresh`; `POST /auth/logout`; `GET /me` |
| Registration/OTP | `POST /auth/verification/start`; `POST /auth/register`; `POST /auth/verification/status`; `POST /auth/verification/resend`; `POST /auth/verification/verify` |
| Password reset | `POST /auth/password-reset/request`; `POST /auth/password-reset/confirm` |
| Profile | `GET /profile`; `GET /profile/avatars`; `PATCH /profile/nickname`; `PATCH /profile/avatar` |
| Legacy room | `POST /rooms`; `POST /rooms/:code/join` |
| Casual room | `POST /casual-rooms`; `POST /casual-rooms/:code/time-control`; `POST /casual-rooms/:code/bet`; `POST /casual-rooms/:code/items`; `GET /casual-rooms/:code/loadout`; `POST /casual-rooms/:code/loadout`; `POST /casual-rooms/:code/join`; `POST /casual-rooms/:code/ready`; `POST /casual-rooms/:code/leave` |
| Shop/inventory | `GET /shop/items`; `GET /inventory`; `POST /shop/purchases` |
| Wallet | `GET /wallet`; `GET /wallet/history`; `GET /wallet/bets/:matchId` |
| Check-in | `GET /check-in`; `POST /check-in/claim` |
| Missions | `GET /missions`; `POST /missions/:code/claim` |
| History | `GET /match-history`; `GET /match-history/:matchId` |
| Friends/block | `GET /players/search`; `GET /friends`; `GET /friends/requests`; `POST /friends/requests`; `POST /friends/requests/:id/accept`; `POST /friends/requests/:id/reject`; `DELETE /friends/requests/:id`; `DELETE /friends/:accountId`; `GET /blocks`; `POST /blocks/:accountId`; `DELETE /blocks/:accountId` |

Guard/DTO:

- Identity-sensitive GET dùng `AuthGuard`; mutation account/cookie/casual dùng thêm `AuthOriginGuard`. GET không bị thêm Origin guard ngoài ý muốn.
- Legacy `/rooms` là hợp đồng nickname/seat-token cũ, không dùng account Auth; casual endpoints là hợp đồng account-bound.
- Pipe strict từ chối field thừa ở auth, profile, reset, room/casual, purchase/loadout, friend mutation, invite, match/item/chat.
- HTTP filter trả envelope an toàn `{statusCode, code, message, requestId}` và không log body/token/cookie/DB URL.

## 4. Inventory Socket.IO

Có hai namespace: `/rooms` và `/friends`. Có **14 event client → server** và **18 event server → client**.

### Client → server (14)

`/rooms` (11):

- `game:move`, `game:resign`
- `match:snapshot`, `match:move`, `match:resign`
- `match:draw:offer`, `match:draw:accept`, `match:draw:reject`
- `match:item:use`
- `match:chat:send`, `match:chat:snapshot`

`/friends` (3):

- `friends:room-invite:create`
- `friends:room-invite:accept`
- `friends:room-invite:decline`

### Server → client (18)

`/rooms` (11):

- `room:session`, `room:state`, `room:left`, `room:replaced`
- `game:state`
- `match:state`, `match:check`, `match:ended`, `match:draw:state`
- `match:chat:message`, `match:chat:closed`

`/friends` (7):

- `friends:presence:snapshot`, `friends:presence:changed`, `friends:relationship:changed`
- `friends:room-invite:received`, `friends:room-invite:expired`, `friends:room-invite:invalidated`, `friends:room-invite:declined`

Điểm cần frontend lưu ý:

- Socket `/rooms` cần roomCode, seatToken và accessToken cho casual; socket mới thay socket cũ của cùng ghế.
- Snapshot match là riêng từng viewer; `ownLoadout`, Scout và pending item không được broadcast room-wide.
- Invite accept/decline bắt buộc chính xác `{requestId, inviteId}`; cache 5 phút chống mất acknowledgement.
- Chat send giữ requestId khi retry; snapshot chat dùng `{matchId}`; message sắp theo sequence.
- Event trạng thái có thể lặp do reconnect/recovery; client phải render idempotent và không tự tạo side effect.

## 5. Lỗi công khai và quy ước client

Nhóm mã chính đã đối chiếu từ source/docs:

- HTTP nền/Auth: `INVALID_JSON`, `INVALID_REQUEST`, `INTERNAL_ERROR`, `ORIGIN_NOT_ALLOWED`, `AUTH_REQUIRED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`, các mã OTP/registration, `INVALID_PASSWORD_RESET_REQUEST`, `INVALID_PASSWORD_RESET_CODE`.
- Profile: request nickname/avatar không hợp lệ, nickname đã tồn tại/cooldown, avatar không tồn tại.
- Room/casual: room not found/full/closed, seat/auth/token/replaced, owner/ready/starting, time-control/bet/loadout invalid.
- Wallet/items: `INSUFFICIENT_GOLD`, `BET_NOT_FOUND`, `INVALID_PURCHASE`, `ITEM_NOT_FOUND`, `ITEM_NOT_FOR_SALE`, `PURCHASE_LIMIT`, `IDEMPOTENCY_KEY_CONFLICT`, các lỗi loadout/items.
- Match: `socket_not_active`, `invalid_match_request`, `match_not_found`, `match_not_active`, `request_id_conflict`, `stale_version`, `not_your_turn`, `illegal_move`, `players_offline`, `game_finished`, `action_pending`, `internal_error`.
- Draw/item: các mã limit/cooldown/not-found/forbidden/expired và `invalid_item_request`, `items_disabled`, `item_not_equipped`, `item_already_used`, `item_no_effect`, `item_no_legal_move`, `item_inventory_empty`.
- Friends/invite: lỗi chung `player_unavailable`/not-found để không lộ block; giới hạn friend/pending/rate; `invalid_room_invite`, `ROOM_INVITE_REQUEST_ID_CONFLICT`, invite expired/cooldown/limit, friend offline/busy.
- Chat: `INVALID_CHAT_REQUEST`, `CHAT_NOT_AVAILABLE`, `CHAT_FORBIDDEN`, `CHAT_RATE_LIMITED`, `CHAT_REQUEST_ID_CONFLICT`, `INVALID_CHAT_TEXT`, `INVALID_CHAT_EMOTE`.

Frontend phải ánh xạ theo `code`, dùng thông báo chung cho mã lạ, không suy luận trạng thái block từ lỗi và không hiển thị message nội bộ.

## 6. Security và privacy audit

### Đã có lớp bảo vệ

- Password dùng scrypt + salt; refresh token và OTP chỉ lưu digest/hash; OTP dùng HMAC có domain tách purpose.
- Access token trong RAM phía browser theo thiết kế; refresh cookie HttpOnly, SameSite=Lax, Secure ở production; mutation nhạy cảm kiểm Origin.
- Socket xóa access token khỏi handshake metadata sau xác thực; seat token so sánh timing-safe.
- Reset request trả generic accepted; confirm dùng OTP 6 số, TTL 5 phút, tối đa 5 lần sai, consume một lần và revoke mọi refresh session.
- Account identity lấy từ guard/session, không nhận accountId tùy ý cho ví, claim, profile hoặc history chính chủ.
- Match/item/chat server-authoritative; expectedVersion/requestId/fingerprint ngăn replay khác payload.
- Loadout chưa dùng, Scout, wallet, inventory và metadata nội bộ không xuất hiện trong payload đối thủ/friend.
- Friend match DTO chỉ gameplay; unfriend/block thu hồi quyền ngay; outsider nhận 404.
- Không phát hiện `.env`, secret thật, private key, credential URL, log body/token/cookie hoặc debug tạm trong diff audit.

### Phân loại phát hiện

| Mức | Phát hiện | Khuyến nghị |
|---|---|---|
| Blocker trước frontend | Không có blocker hợp đồng backend đã biết | Có thể bắt đầu nối frontend theo inventory ở báo cáo này. |
| Đã xử lý | Registration OTP trước đây gọi mailer trong transaction | Đã tách reserve → mail ngoài transaction → activate; fake mailer deferred chứng minh account/reservation commit và không có OTP active trong lúc mailer pending; test thêm request xen giữa và activate failure. |
| Blocker trước production | Runtime phòng/trận/presence/invite/chat chỉ một process; restart mất active board, clock, presence, invite, chat | Chốt chính sách deploy single-instance + graceful drain/advisory lock, hoặc thiết kế persistence/Redis trước khi scale/HA. |
| Blocker trước production | SMTP mới được test bằng fake mailer/config; chưa có bằng chứng delivery production | Cấu hình secret qua môi trường, chạy `smtp:check` và smoke delivery ở môi trường staging, không ghi OTP vào log. |
| Hardening sau V1 | Access JWT đã phát có thể còn hiệu lực tối đa 15 phút sau password reset | Chấp nhận tài liệu hiện tại hoặc thêm token/session version nếu cần revoke access tức thì. |
| Hardening sau V1 | Rate limit friends/chat/invite và cache realtime là RAM cục bộ | Phù hợp một instance; chuyển store dùng chung khi mở nhiều instance. |
| Chấp nhận local/V1 | OTP local mailbox, fixture local và dữ liệu RAM mất khi restart | Chỉ bật local ngoài production; không coi mailbox local là kênh thật. |

## 7. Ma trận transaction và idempotency

| Luồng | Boundary/lock/key | Retry, lost response và partial failure |
|---|---|---|
| Registration/verification OTP | Transaction reserve khóa normalized email; SMTP ngoài transaction; transaction activate lấy lại cùng khóa | Unique nickname/email và active OTP; resend/verify cạnh tranh, request xen giữa, SMTP/activate failure được test; mã cũ chỉ mất hiệu lực sau activate commit. |
| Password reset | Reserve transaction + email lock; SMTP ngoài transaction; activate transaction; confirm khóa account/OTP | Generic request; one-time OTP; confirm atomic password/session revoke; mail-sent-before-activate có cửa sổ retry 60 giây đã được tài liệu hóa. |
| Nickname/avatar | Transaction; account row/advisory serialization và unique nickname key | No-op/cooldown/concurrency; lỗi rollback. |
| Check-in | Transaction + account/date uniqueness + wallet ledger operation key | Same-day/concurrent retry trả một claim; held gold không đổi. |
| Mission contribution/claim | PK match/account/version; unique progress period; wallet ledger reference | Recovery/lost response không tăng progress hoặc cộng thưởng hai lần. |
| Purchase | Transaction khóa wallet; unique account/requestId + fingerprint | Wallet, inventory, purchase, ledger cùng commit/rollback. |
| Wager | Transaction khóa hai wallet theo thứ tự; matchId identity | Hold/result/settle idempotent; lost commit response refund/retry; startup recovery. |
| Match reward | Match result durable + unique reward/ledger reference | Pending retry; reward độc lập payout; conflict result bị từ chối. |
| Item usage | Advisory/account transaction; unique match/account/request và match/account/item | Chỉ commit mới cài effect; pending chặn gameplay; retry không tiêu hao hai lần. |
| Match history | `matchId` unique; start/finalize transaction + fingerprint/identity checks | Retry no-op; conflict payload bị từ chối; recovery partial không bịa board. |
| Friends/block | Advisory lock cặp canonical + unique/partial unique DB | Reciprocal auto-accept; retry/constraint chống duplicate. |
| Room invite | RAM account/action/requestId + fingerprint; resolution flight + TTL 5 phút | Lost ack/concurrent retry không join/emit hai lần; restart mất cache/invite. |
| Chat | RAM match/account/requestId + fingerprint; xử lý đồng bộ với terminal | Retry không broadcast/quota lần hai; restart mất buffer/idempotency. |
| Match move/resign/draw/terminal | Serialization trong `RoomsService`, expectedVersion, request cache theo ghế/trận | Deadline phân xử trước commit; terminal khóa một lần; DB side effects retry độc lập. |

Không còn network/SMTP trong transaction của password reset hoặc registration OTP. Regression test giữ fake mailer unresolved và đọc DB từ request khác để chứng minh transaction reserve đã commit trước khi mailer hoàn tất.

## 8. Persistence và restart

| Dữ liệu | Nơi lưu | Sau restart |
|---|---|---|
| Account/profile/avatar/session/OTP quota | PostgreSQL | Giữ; refresh chưa revoke còn hiệu lực tới hạn. |
| Wallet, ledger, wager, purchase, inventory, loadout snapshot, item usage | PostgreSQL | Giữ; wager held/result_pending được startup recovery. |
| Reward, check-in, mission, match/wallet history, friends/block | PostgreSQL | Giữ; idempotency dựa constraint/key bền vững. |
| Room/seat/active match/board/clock/action cache | RAM | Mất; history active recovery thành start_aborted hoặc backend_restart partial; không phục hồi ván. |
| Presence, room invite và invite idempotency | RAM | Mất; mọi người offline, invite hết hiệu lực. |
| Chat buffer, quota và idempotency | RAM theo match | Mất. |

## 9. Database audit

- Development xác nhận `xiangqi_dev`/`xiangqi_app`, 10 journal entries, migration cuối `0009`.
- Không tạo migration `0010`; profile/avatar dùng cột/bảng có sẵn, password reset tái sử dụng `auth_email_otps`/`auth_email_sends` với purpose constraint đã có.
- Constraint chính đã đối chiếu: normalized email/nickname unique; một active OTP theo account/purpose; wallet không âm; wager/result state; inventory không âm; item usage/loadout/purchase idempotency; check-in account/date; mission period/contribution; match history/participant; canonical friendship/pending pair/directed block.
- Password, refresh token và OTP không lưu plaintext trong DB (`password_hash`, `refresh_token_hash`, OTP `digest`). Seat token và realtime state chỉ ở RAM.
- Các integration PostgreSQL chạy migration 0000–0009 trong schema ngẫu nhiên và cleanup sau test; development verify rollback dữ liệu thử.

## 10. Frontend readiness checklist

| Màn hình/luồng | API/event cần nối | Trạng thái bắt buộc |
|---|---|---|
| 1. Đăng ký | registration endpoints | clean/submitting/field error/toast; giữ accountId cho OTP; không tự retry POST. |
| 2. Xác minh OTP | status/resend/verify | TTL/resendAt, expired toast, 5 attempts, delivery failed. |
| 3. Đăng nhập | login, refresh, `/me` | access in memory; refresh on reload/expiry; pending verification redirect. |
| 4. Quên mật khẩu | reset request | Luôn generic success; không tiết lộ email tồn tại. |
| 5. Đặt lại mật khẩu | reset confirm | OTP/new password errors; thành công về login; session cũ bị revoke. |
| 6. Hồ sơ | `GET /profile` | nickname cooldown, email/verified timestamps, no-store. |
| 7. Đổi nickname | PATCH nickname | strict DTO, cooldown/conflict, giữ input và focus lỗi. |
| 8. Chọn avatar | GET avatars + PATCH avatar | Chỉ render catalog server trả; fallback asset an toàn. |
| 9. Sảnh chính | wallet, check-in, missions, friends presence | Loading độc lập; không suy luận dữ liệu riêng tư. |
| 10. Cửa hàng | shop items + purchase | Giá/version từ server; requestId mới cho ý định mới, giữ ID khi retry. |
| 11. Kho/loadout | inventory + loadout | Chỉ dữ liệu chính chủ; 0–3 món; loadout đối thủ bí mật. |
| 12. Tạo/vào phòng casual | casual room endpoints | Auth/Origin; room code/seatToken; lỗi full/not-found an toàn. |
| 13. Phòng chờ | room socket + time/bet/items/loadout/ready | Reconnect ghế, tab mới thay tab cũ; không auto-ready khi invite. |
| 14. Bàn đấu | match events/actions | Server snapshot là nguồn thật; requestId + expectedVersion; deadline từ serverNow. |
| 15. Vật phẩm | item action/snapshot riêng | Confirm trước dùng; pending action; Scout riêng; effect/expiry từ server. |
| 16. Cầu hòa/đầu hàng | draw/resign events | Cooldown/count/expiry; không tự chốt kết quả. |
| 17. Chat/emote | chat send/snapshot/message/closed | Buffer cuộn riêng; escape text; 8 emote; rate retryAfterMs; mute local. |
| 18. Kết quả | match ended/state | Phân biệt result và payout/reward pending; event lặp phải idempotent. |
| 19. Ví/lịch sử ví | wallet/history/bet | Cursor/filter; `netAmount`; không đọc metadata thô. |
| 20. Điểm danh/nhiệm vụ | status/list + claim | Server quyết date/period/amount; toast; claim concurrent an toàn. |
| 21. Lịch sử trận/detail | match history | Cursor/filter; partial board nullable; friend DTO không có tài chính. |
| 22. Bạn bè/presence/invite | Friends HTTP + `/friends` | Snapshot replace khi reconnect; lỗi block chung; invite requestId; activity unknown khi offline. |

Quy tắc UI chung: màn game cố định không cuộn toàn trang ở 1366×768/1440×900; chat/danh sách dài cuộn trong vùng riêng; mobile 375px/form dài được cuộn tự nhiên; toast không làm đổi kích thước form; không log token, OTP, cookie, seat token hoặc payload riêng tư.

## 11. Kết quả kiểm tra mới

| Lệnh/nhóm | Pass | Fail | Skip |
|---|---:|---:|---:|
| `test:profile` | 1 suite | 0 | 0 |
| `test:password-reset` | 1 suite | 0 | 0 |
| `test:auth` | 1 suite | 0 | 0 |
| `test:registration` | 1 suite | 0 | 0 |
| `test:chat` | 10 | 0 | 0 |
| `test:friends` | 6 | 0 | 0 |
| `test:history` | 7 | 0 | 0 |
| `test:wallet` | 21 | 0 | 0 |
| `test:items` | 9 | 0 | 0 |
| `test:missions` | 9 | 0 | 0 |
| `test:reward` | 6 | 0 | 0 |
| `test:check-in` | 7 | 0 | 0 |
| Backend đầy đủ `npm.cmd test` | 112 | 0 | 0 |
| **Tổng theo output các lệnh** | **191** | **0** | **0** |

`typecheck`, `build`, `db:check`, `db:verify` và `git diff --check` đều exit 0. Không skip. Bốn script profile/reset/Auth/registration xuất một kết quả PASS cấp suite thay vì TAP count chi tiết; tổng trên tính mỗi script là một suite, không suy diễn số assertion nội bộ. Các bộ riêng có giao nhau với backend đầy đủ; tổng 191 là tổng lần kiểm tra đã chạy, không phải số test case duy nhất.

Lượt cập nhật 2026-11-19 đã chạy lại toàn bộ bảng trên. Suite registration mới dùng deferred fake mailer, không sleep/SMTP thật, và kiểm tra transaction reserve đã commit trước khi mailer hoàn tất, OTP chưa active, request xen giữa không gửi/activate lần hai, activate failure không tạo challenge hợp lệ và retry tạo challenge mới.

## 12. Khuyến nghị phát hành

1. **Cho phép bắt đầu frontend integration** theo 49 HTTP endpoints, 14 client events và 18 server events đã kiểm kê.
2. Chốt deployment một instance có graceful shutdown/advisory lock, hoặc hoãn production cho tới khi có shared realtime state; không chạy nhiều replica với kiến trúc RAM hiện tại.
3. Xác minh SMTP staging/production, HTTPS/cookie Secure, Origin allowlist và secret management.
4. Sau khi frontend nối xong, chạy E2E trình duyệt cho reconnect, mất acknowledgement, mobile/desktop layout, privacy hai tài khoản và recovery result/payout pending.

Kết luận cập nhật: **backend contract V1 sẵn sàng để frontend tích hợp; blocker SMTP-transaction đã resolved. Production vẫn NO-GO cho tới khi nghiệm thu SMTP staging/production và chốt/đáp ứng giới hạn vận hành single-instance/restart.**
