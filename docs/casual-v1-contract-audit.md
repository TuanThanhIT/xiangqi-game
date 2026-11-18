# Audit hợp đồng backend Giải trí V1

Ngày audit: 18/11/2026. Nguồn sự thật ưu tiên: source và test tại commit
`951fd38ce03a85d39fc224816908a217d43de9d3`; tài liệu đặc tả được dùng để đối
chiếu. Audit chỉ đọc, không thay đổi source, test, schema hay migration.

## 1. Checkpoint và quy ước chung

- Branch `master`, HEAD như trên; local ahead `origin/master` 10, behind 0.
- Development DB: `xiangqi_dev`, role `xiangqi_app`; migration mới nhất `0009`,
  journal 10 bản ghi; `db:verify` đạt.
- HTTP được mount trực tiếp tại path ghi trong bảng. Mọi response đi qua middleware
  `x-request-id`; lỗi chuẩn là `{statusCode,code,message}` và `Cache-Control:
  no-store`. `Auth` nghĩa là Bearer access token. `Origin` nghĩa là
  `AuthOriginGuard`.
- Ba thay đổi frontend có sẵn không thuộc audit và không bị chạm tới.

## 2. Inventory HTTP (44 endpoint)

### Base, Auth và OTP

| Method/path | Chủ sở hữu; guard | Input và validation | Thành công | Lỗi/quyền/retry và dữ liệu cấm |
|---|---|---|---|---|
| `GET /health` | `HealthController`; công khai | Không input | `200 {status:"ok"}` | Không dữ liệu riêng; chỉ đọc. |
| `POST /auth/login` | Auth; Origin, không Auth | Body chính xác `{email,password}`; email chuẩn hóa; password string | `200 {accessToken,expiresAt,profile}` và refresh cookie HttpOnly | `INVALID_LOGIN_INPUT`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ORIGIN_NOT_ALLOWED`; không trả hash/token phiên khác. Không tự retry POST. |
| `POST /auth/refresh` | Auth; Origin | Refresh cookie; không body nghiệp vụ | `200 {accessToken,expiresAt,profile}` | `SESSION_EXPIRED`/`UNAUTHENTICATED`; cookie hết hạn bị xóa. Retry với cùng cookie được hỗ trợ khi mất response. |
| `POST /auth/logout` | Auth; Origin | Refresh cookie | `200 {ok:true}`, xóa cookie | Idempotent thực dụng; không trả session/token. |
| `GET /me` | Auth; Auth | Không input | profile `{id,email,nickname,avatar}` | Chỉ chính chủ; không trả password/digest/session. |
| `POST /auth/verification/start` | Registration; Origin | `{email,password}` qua `LoginPipe` | Trạng thái OTP `{status,accountId,maskedEmail,...}` | Các lỗi login/registration; không trả OTP. Không tự retry. |
| `POST /auth/register` | Registration; Origin | `{email,password,nickname}`; nickname 1–30 ký tự sau chuẩn hóa | Trạng thái pending gồm `accountId`, email che và hạn | `INVALID_REGISTRATION_INPUT`, `INVALID_NICKNAME`, `EMAIL_IN_USE`, `NICKNAME_IN_USE`; không trả OTP/hash. Transaction/idempotency theo hồ sơ pending. |
| `POST /auth/verification/status` | OTP; Origin | `{accountId}` UUID; đúng một trường | Trạng thái pending/verified và mốc thời gian công khai | `INVALID_OTP_INPUT`, `REGISTRATION_EXPIRED`; không trả OTP/digest. Chỉ đọc. |
| `POST /auth/verification/resend` | OTP; Origin | `{accountId}` UUID | Trạng thái OTP mới, email che/hạn/cooldown | `OTP_SEND_LIMIT`, `OTP_ALREADY_USED`, `REGISTRATION_EXPIRED`; không tự retry, không trả mã. |
| `POST /auth/verification/verify` | OTP; Origin | `{accountId,code}`; UUID + đúng 6 chữ số | `200 {ok:true}` | `OTP_INVALID`, `OTP_EXPIRED`, `OTP_LOCKED`, `OTP_ALREADY_USED`; transaction chống dùng hai lần. |

### Phòng legacy và phòng Giải trí

| Method/path | Chủ sở hữu; guard | Input và validation | Thành công | Lỗi/quyền/retry và dữ liệu cấm |
|---|---|---|---|---|
| `POST /rooms` | Rooms legacy; công khai | `{nickname,themeId?}`; nickname 1–30 Unicode; theme hợp lệ | `201 SeatResponse {roomCode,seat:"red",nickname,seatToken}` | `INVALID_REQUEST`, `ROOM_CODE_UNAVAILABLE`; seat token là bí mật, không retry tự động. |
| `POST /rooms/:code/join` | Rooms legacy; công khai | code 6 ký tự; `{nickname}` | `200 SeatResponse` ghế đen | `INVALID_ROOM_CODE`, `ROOM_NOT_FOUND`, `ROOM_FULL`; không lộ token ghế kia. |
| `POST /casual-rooms` | Casual rooms; Auth+Origin | `{themeId,totalMinutes?}`; total 5/10/15/30/60, mặc định 15 | `201 SeatResponse` thêm `casual:true` | Mã room/input/auth; profile lấy từ token. Không tự retry. |
| `POST /casual-rooms/:code/time-control` | Casual; Auth+Origin | `{totalMinutes}` đúng tập cho phép; chỉ owner, trước ready/start | `200 {ok:true}` | `INVALID_TIME_CONTROL`, `NOT_ROOM_OWNER`, `PLAYERS_READY`, `GAME_ALREADY_STARTED`. |
| `POST /casual-rooms/:code/bet` | Casual/wallet; Auth+Origin | `{stake}` số nguyên an toàn không âm; owner, trước ready/start | `200 {ok:true}` | `INVALID_BET`, `INSUFFICIENT_GOLD`, room/owner/ready/start; không nhận accountId/amount kết quả. |
| `POST /casual-rooms/:code/items` | Casual/items; Auth+Origin | `{enabled:boolean}`; owner, trước ready/start | `200 {ok:true}` | Room/owner/ready/start; chỉ công khai cờ bật/tắt, không loadout. |
| `GET /casual-rooms/:code/loadout` | Loadout; Auth | code hợp lệ; phải là thành viên | `{itemsEnabled,itemCodes}` của chính người gọi | `NOT_ROOM_MEMBER`, room/code; tuyệt đối không trả loadout đối thủ. |
| `POST /casual-rooms/:code/loadout` | Loadout; Auth+Origin | `{itemCodes:string[]}`; 0–3 code duy nhất, có trong kho/catalog | `200 {ok:true}` | `INVALID_LOADOUT`, thiếu kho, room/ready/start; trang bị không tiêu hao. |
| `POST /casual-rooms/:code/join` | Casual; Auth+Origin | body chính xác `{}` | `200 SeatResponse` thêm `casual:true` | Room full/not found/member; account lấy từ Auth. Không tự ready. |
| `POST /casual-rooms/:code/ready` | Casual; Auth+Origin | `{ready:boolean}` | `200 {ok:true}`; lần ready thứ hai có thể kích hoạt start bất đồng bộ | Room/start/hold errors; client chờ response rồi chờ snapshot/socket, không suy đoán đã start. |
| `POST /casual-rooms/:code/leave` | Casual; Auth+Origin | body chính xác `{}` | `200 {ok:true}` | Room/member/start rules; thu hồi ghế/token theo service. |

### Shop, kho, ví và phần thưởng

| Method/path | Chủ sở hữu; guard | Input và validation | Thành công | Lỗi/quyền/retry và dữ liệu cấm |
|---|---|---|---|---|
| `GET /shop/items` | Items; Auth | Không input | mảng `{code,name,description,group,priceGold,onSale,displayOrder,version,metadata}` | Catalog server; không có dữ liệu kho người khác. |
| `GET /inventory` | Inventory; Auth | Không input | kho của chính chủ với item/quantity | Không nhận accountId; không trả kho người khác. |
| `POST /shop/purchases` | Shop; Auth+Origin | `{requestId:UUIDv4,itemCode,quantity:1..99}` chính xác | `{requestId,itemCode,quantity,unitPrice,totalPrice,inventoryQuantity,availableGold,createdAt}` | `INVALID_PURCHASE`, item/sale/funds/conflict; cùng requestId+payload trả kết quả cũ, payload khác conflict; transaction một lần. |
| `GET /wallet` | Wallet; Auth | Không query (pipe từ chối key lạ) | `{availableGold,heldGold,totalGold,version}` | `WALLET_NOT_FOUND`; chỉ chính chủ, không metadata ledger. |
| `GET /wallet/history` | Wallet; Auth | `before` entryNo, `limit` 1–100, category/type, `from/to` ngày VN | `{items,nextCursor}`; item allowlist gồm delta/net/direction/time/reference công khai | `INVALID_WALLET_QUERY`; không trả metadata thô, accountId đối tác hay nội dung riêng. |
| `GET /wallet/bets/:matchId` | Betting; Auth | matchId UUIDv4 | trạng thái cược của participant: match/room/stake/status/result/timestamps | `BET_NOT_FOUND`; người ngoài nhận 404; không trả hai accountId. |
| `GET /check-in` | Check-in; Auth | Không input | `{serverDate,timezone,claimedToday,canClaim,currentCycleDay,nextCycleDay,consecutiveDays,lastClaimedDate,nextResetAt,milestones,todayClaim}` | Chỉ chính chủ; chỉ đọc. |
| `POST /check-in/claim` | Check-in; Auth+Origin | body `{}` | snapshot claim `{checkInId,localDate,cycleDay,reward...,walletBalance,claimedAt}` | `INVALID_CHECK_IN_REQUEST` và conflict nghiệp vụ; transaction/idempotent theo account+localDate; không nhận date/timezone/cycle/amount. |
| `GET /missions` | Missions; Auth | `category=daily|weekly|achievement|all`, mặc định all | `{serverTime,timezone,dailyResetAt,weeklyResetAt,items:[definition+progress]}` | `invalid_mission_category`; chỉ tiến độ chính chủ. |
| `POST /missions/:code/claim` | Missions; Auth+Origin | code `[a-z][a-z0-9_]{1,63}`, body `{}` | `{missionCode,category,periodKey,rewardGold,status,walletBalance,claimedAt}` | Các mã `mission_*`; transaction ledger/idempotent, request sau đã claim nhận conflict; không nhận progress/amount/accountId. |

### Lịch sử và Friends

| Method/path | Chủ sở hữu; guard | Input và validation | Thành công | Lỗi/quyền/retry và dữ liệu cấm |
|---|---|---|---|---|
| `GET /match-history` | History; Auth | cursor ≤500, limit 1–100; mode/result/reason/from/to | `{items,nextCursor}` danh sách chỉ các trận của chính chủ | Query/cursor invalid; không mở list của bạn bè, không loadout/Scout/metadata. |
| `GET /match-history/:matchId` | History; Auth | UUIDv4 | Participant: detail đầy đủ phần của mình; friend hiện tại: gameplay-only | Không tồn tại/không quyền/block đều 404. Friend không nhận stake, net, reward, wallet, inventory, loadout hay Scout. |
| `GET /players/search` | Friends; Auth | `nickname` bắt buộc, trim, 1–100 ký tự; tìm chính xác nicknameKey | hồ sơ công khai tối thiểu hoặc trạng thái không khả dụng | `invalid_player_search`; block dùng `player_unavailable` để không lộ người chặn. |
| `GET /friends` | Friends; Auth | Không input | `{items:[{accountId,nickname,avatar,presence,activity,friendsSince}]}` | Chỉ danh sách chính chủ; presence RAM. |
| `GET /friends/requests` | Friends; Auth | `direction=incoming|outgoing` bắt buộc | `{items:[{requestId,accountId,nickname,avatarId,createdAt}]}` | `invalid_friend_request`; chỉ request liên quan người gọi. |
| `POST /friends/requests` | Friends; Auth+Origin | `{targetAccountId:UUIDv4}` | DTO request pending | invalid/not found/already/blocked/limits/rate-limit; transaction và canonical pair chống trùng. |
| `POST /friends/requests/:id/accept` | Friends; Auth+Origin | id UUIDv4, body `{}` | DTO quan hệ/request đã resolve | Chỉ recipient; not found/limits; transaction idempotency theo trạng thái DB. |
| `POST /friends/requests/:id/reject` | Friends; Auth+Origin | id UUIDv4, body `{}` | DTO request rejected | Chỉ recipient; request đã xử lý được che như not found. |
| `DELETE /friends/requests/:id` | Friends; Auth+Origin | id UUIDv4, không body | DTO request cancelled | Chỉ sender; retry sau hoàn tất nhận not found. |
| `DELETE /friends/:accountId` | Friends; Auth+Origin | accountId UUIDv4 | `{ok:true}` | `friendship_not_found`; một bên được hủy, quyền history thu hồi ngay. |
| `GET /blocks` | Friends; Auth | Không input | `{items:[{accountId,nickname,avatarId,createdAt}]}` | Chỉ chính chủ; không công khai cho người bị block. |
| `POST /blocks/:accountId` | Friends; Auth+Origin | UUIDv4, body `{}` | `{ok:true}` | Không tự block; transaction xóa friendship/request; phía kia chỉ thấy trạng thái chung. |
| `DELETE /blocks/:accountId` | Friends; Auth+Origin | UUIDv4 | `{ok:true}` | Chỉ blocker; không tự khôi phục friendship. |

Ghi chú HTTP: mọi POST/DELETE trình duyệt dùng cookie hoặc Bearer cần chờ response;
không tự retry ngoại trừ khi hợp đồng có `requestId`/khóa idempotency rõ. Source tham
chiếu: `src/**/*controller.ts`, các pipe tương ứng, `http-error.filter.ts` và service.

## 3. Inventory Socket.IO (28 event theo hướng)

### Namespace `/rooms`

Handshake yêu cầu `{roomCode,seatToken,accessToken?}`; phòng casual bắt buộc access
token khớp account của ghế. Origin allowlist được kiểm tra. Reconnect luôn xác thực
lại, ghế mới thay ghế cũ và client phải lấy snapshot mới; không bật Socket.IO
connection-state recovery.

| Hướng/event | Payload / acknowledgement / lỗi | Broadcast, riêng tư và retry |
|---|---|---|
| C→S `game:move` | Legacy `{requestId,expectedRevision,pieceId,to}`; ack success `{ok:true,requestId,appliedRevision}` hoặc lỗi kèm `code,message,currentRevision?` | Ghế đang sở hữu socket; UUID cache chống lặp/conflict. Không dùng cho match casual mới. |
| C→S `game:resign` | `{requestId}`; cùng dạng ack revision | Ghế hiện hành; idempotent qua request cache. |
| C→S `match:snapshot` | Không payload hoặc object `{}`; kiểu khác/trường thừa trả `invalid_match_snapshot_request`; ack `{ok:true,snapshot}` hoặc `{ok:false,code}` | Snapshot riêng từng ghế; reconnect phải gọi hoặc dùng push khi attach. Không requestId/version. |
| C→S `match:move` | Base `{matchId,requestId,expectedVersion}` + `from,to`; ack `{ok:true,requestId,stateVersion}` hoặc `{ok:false,requestId,code,currentVersion?}` | Server phân xử clock/turn/rules; request cache theo fingerprint. |
| C→S `match:resign` | Base | Cùng cache; persistence terminal trước side effects. |
| C→S `match:draw:offer` | Base | Tối đa 3/bên, cooldown 60s; offer sống 15s. |
| C→S `match:draw:accept` | Base + `offerId` | Chỉ bên kia; terminal agreement khi thành công. |
| C→S `match:draw:reject` | Base + `offerId` | Chỉ bên kia; retry theo request cache. |
| C→S `match:item:use` | `{matchId,requestId,expectedVersion,itemCode,target?}`; ack success có thể thêm `scout` chỉ người dùng | Transaction consume idempotent; pending chặn action xen giữa; loadout/Scout riêng không broadcast. |
| S→C `room:session` | `{roomCode,seat}` | Chỉ socket vừa attach. |
| S→C `room:replaced` | `{code:"SEAT_REPLACED",message}` | Chỉ socket cũ, sau đó disconnect. |
| S→C `room:left` | `{code:"ROOM_CLOSED"|"ROOM_LEFT"}` | Owner rời: cả channel; guest rời: socket guest; sau đó disconnect mục tiêu. |
| S→C `room:state` | `PublicRoomState`: room/theme/players/timeControl/bet/itemsEnabled | Cả room; không seat token/loadout/wallet. |
| S→C `game:state` | `PublicGameState`: game/playEnabled/serverNow/deadlines/clock/bet | Cả room; clock nằm trong snapshot, không có event clock riêng. |
| S→C `match:state` | `MatchSnapshot` riêng từng viewer | Emit từng socket, gồm ownLoadout/ownScout/ownPendingItem; tuyệt đối không broadcast chung. |
| S→C `match:check` | `{matchId,stateVersion,side}` | Từng socket trong phòng khi snapshot active đang chiếu. |
| S→C `match:ended` | Toàn bộ snapshot terminal/result_pending/finished | Từng socket; client không tự quyết toán, xem `reward`/`bet.pending`. |
| S→C `match:draw:state` | `{matchId,stateVersion,offer}` | Từng socket khi có offer kể cả expired. |

`MatchSnapshot` chính xác gồm `matchId,roomCode,viewerSide,players,board,sideToMove,
moveNumber,stateVersion,captured,startedAt,serverNow,clock,inCheck,status,result,reason,
reward,drawOffer,drawCounts,ownDrawAvailableAt,ownLoadout,turnSequence,activeEffects,
usedItems,ownUsedItems,ownScout,ownPendingItem`. `activeEffects` bỏ
`ownerAccountId`; kết quả Scout chỉ nằm ở `ownScout` hoặc ack người sử dụng.

### Namespace `/friends`

Handshake đúng một key `{accessToken}` và Origin allowlist. Presence/invite chỉ RAM
trên một instance; reconnect nhận snapshot mới.

| Hướng/event | Payload / acknowledgement / lỗi | Người nhận, riêng tư và retry |
|---|---|---|
| C→S `friends:room-invite:create` | `{requestId:UUIDv4,roomCode,targetAccountId}`; `{ok:true,invite}` hoặc `{ok:false,code}` | Chỉ host là bạn, target online/available, phòng còn ghế. requestId cache; cùng payload trả invite cũ, khác payload conflict. |
| C→S `friends:room-invite:accept` | `{requestId,inviteId}`; success từ `joinCasual`/invite service, hoặc lỗi | Chỉ target; không tự ready. Cache kết quả RAM 5 phút; retry đồng thời/mất ack trả cùng kết quả và không join lần hai. |
| C→S `friends:room-invite:decline` | `{requestId,inviteId}`; ack ok/lỗi | Chỉ target; cache kết quả RAM 5 phút và không emit decline lần hai. |
| S→C `friends:presence:snapshot` | `{items:[FriendDto]}` | Chỉ account vừa kết nối; danh sách bạn hiện tại. |
| S→C `friends:presence:changed` | `{accountId,presence,activity}` | Chỉ bạn hiện tại của account đổi trạng thái. |
| S→C `friends:relationship:changed` | `{accountId}` | Hai account liên quan; client refetch danh sách/request. |
| S→C `friends:room-invite:received` | Invite + host public profile + room public settings | Chỉ target. Không seat token/loadout. |
| S→C `friends:room-invite:declined` | Invite DTO | Chỉ host. |
| S→C `friends:room-invite:expired` | Invite DTO | Host và target. |
| S→C `friends:room-invite:invalidated` | Invite DTO | Host và target khi offline/phòng mất hiệu lực. |

Presence snapshot/changed và relationship changed không có sequence/version; client
phải refetch khi nghi ngờ mất hoặc đảo thứ tự event.

## 4. Lifecycle tổng thể

| Bước | Trạng thái/transaction | Recovery và điều client phải chờ |
|---|---|---|
| Đăng ký/OTP/login | Account, OTP, session trong PostgreSQL; register/verify/session dùng transaction thích hợp | Session bền vững; client chờ HTTP, giữ access token trong memory và refresh cookie HttpOnly. |
| Vào sảnh/Friends | Friends/block/request ở PostgreSQL; presence RAM | Restart giữ social graph nhưng mất presence/invite; client reconnect `/friends` và nhận snapshot. |
| Tạo/vào phòng | Phòng, ghế, token, ready, cấu hình ở RAM | Restart mất phòng; client chờ SeatResponse rồi handshake `/rooms`. |
| Cấu hình time/bet/items/loadout | Cấu hình phòng RAM; inventory/loadout nguồn DB, lựa chọn chờ ở RAM | Chờ HTTP ack rồi lấy `room:state`/own loadout; không suy đoán từ optimistic UI. |
| Hai bên ready/start | Hold wager, snapshot loadout và tạo history start dùng PostgreSQL transaction; match/board/clock RAM | Recovery hoàn held chưa có result và đánh dấu history partial/cancelled; client chờ ack ready **và** `match:state`. |
| Move/item/draw | Bàn, clock, draw/effect RAM; item consume + usage PostgreSQL transaction | Item retry bền vững; move/draw cache chỉ RAM. Client chỉ cập nhật authoritative state sau ack/snapshot. |
| Disconnect/timeout/resign/result | Presence/30s offline deadline/timer RAM; terminal history được finalize bền vững trước wager/reward/mission | Restart tạo backend_restart/partial theo activity; client chờ `match:ended`, nhưng phân biệt `result_pending` và `finished`. |
| Settlement/reward/mission | Wager/result, reward ledger, mission contribution/progress ở PostgreSQL; từng domain có transaction/idempotency | Startup recovery theo thứ tự wager → reward → mission; UI chỉ dùng balance/status sau commit. |
| History/wallet | PostgreSQL | Bền vững, cursor server; friend authorization được kiểm tra tại thời điểm đọc. |
| Quay lại waiting/trận sau/rời | Room và ready/config phần lớn RAM; settlement gate ngăn chuyển sớm | Chờ state/ack; restart không phục hồi room hay rematch. |

Thứ tự terminal quan trọng: chốt luật/clock một lần → finalize match history → ghi
contribution/result bền vững → wager/reward/mission side effects → phát trạng thái
`finished`. Có thể phát `result_pending`, nhưng không được coi tiền đã hoàn tất.

## 5. Privacy matrix

| Dữ liệu | Chính chủ/participant | Đối thủ | Bạn hiện tại không tham gia | Người ngoài/bị block |
|---|---|---|---|---|
| Profile public | Có | Có | Có | Search trả tối thiểu nếu khả dụng; block bị che |
| Wallet/inventory | Chỉ chính chủ | Không | Không | Không |
| Loadout chưa dùng | `ownLoadout` | Không | Không | Không |
| Item đã dùng/effect công khai | Có | Có | History gameplay-only có item đã dùng | 404 |
| Scout target/result | Chỉ người dùng item | Không | Không | Không |
| Match stake/net/reward | Participant chỉ phần của mình | Phần của chính họ | Không | 404 |
| Match gameplay detail | Có | Có | Có nếu vẫn là bạn với participant và không block bất kỳ participant | 404 |
| Match list | Chỉ list của chính chủ | — | Không mở list người khác | Không |
| Friend requests/blocks | Chỉ chính chủ | Không | Không | Không |
| Presence/activity | Chính chủ và bạn hiện tại | Nếu là bạn | Có | Không |
| Room invite | Host và target | — | Chỉ hai bên | Không |

## 6. Persistence và recovery

| Domain | PostgreSQL | Chỉ RAM | Recovery sau restart |
|---|---|---|---|
| Auth/OTP/session | Có | Access token phía client | Session/OTP tiếp tục theo hạn DB. |
| Friends/block/request | Có | Presence, socket, room invite | Quan hệ còn; presence offline, invite mất. |
| Room/waiting | Không | Toàn bộ room/seat/ready/config | Không phục hồi. |
| Match board/clock/draw/effect | Không | Có | History active thành cancelled/partial; không dựng lại bàn. |
| Loadout/inventory/item usage | Catalog/kho/snapshot/usage có | Effect đang chạy có | Usage/consume còn; effect/board không phục hồi. |
| Wager/reward/mission/check-in | Có | Settlement flight/timer có phần RAM | Có worker/recovery idempotent cho wager, reward, mission; check-in tự nhiên theo unique key. |
| History/wallet ledger | Có | Không đáng kể | Đọc lại đầy đủ; partial board có thể null. |
| Chat | Chưa có | Chưa có | Theo spec sau này phải RAM-only, không history. |

## 7. Mismatch và rủi ro nhất quán

1. **Hai concurrency domain được giữ riêng có chủ ý.** Legacy room dùng
   `expectedRevision`/`appliedRevision`; casual match dùng
   `expectedVersion`/`stateVersion`. Frontend bắt buộc tạo hai type riêng, không dùng
   một type chung với các field optional và không đổi tên wire contract.
2. **Quy ước thời gian V1.** `totalMinutes` là số phút cấu hình. Các khoảng thời
   gian có hậu tố `Ms` như `durationMs`, `retryAfterMs`, `expiresInMs`, `totalMs`,
   `turnMs` là mili-giây. `serverNow`, `deadlineAt`, `turnDeadlineAt` và `expiresAt`
   của draw/effect trong match snapshot là epoch mili-giây. Timestamp HTTP
   history/check-in/Auth và `expiresAt` của room-invite DTO là ISO 8601. Không đổi
   wire contract hiện có.
3. **Error code casing không đồng nhất.** Base/legacy/wallet/auth chủ yếu
   `UPPER_SNAKE_CASE`; match, missions, history, items và Friends chủ yếu
   `lower_snake_case`. Socket Friends ack chỉ có `code`, legacy move thêm `message`,
   HTTP luôn có status/message.
4. **Presence/relationship event thiếu sequence/version.** Event đảo thứ tự hoặc mất
   trong reconnect window buộc client refetch; snapshot chỉ được gửi khi connect.
5. **Không có event clock riêng.** Yêu cầu “clock update/timeout” được đáp ứng qua
   `game:state`, `match:state` và `match:ended`, không có `clock:update`. Frontend
   phải nội suy từ `serverNow`/deadline, hiệu chỉnh bằng snapshot/event tiếp theo và
   lấy snapshot mới khi reconnect; không chờ tick server.
6. **Profile V1 trong product spec chưa đủ endpoint.** Đổi nickname 30 ngày, chọn
    avatar và quên/reset password được nêu ở product spec nhưng không có controller
    hiện tại. Đây là gap chức năng, không phải rò rỉ contract đang chạy.
7. **Chat/emote hoàn toàn chưa có.** Không namespace/event/service/rate-limit/mute;
    mốc “Cộng đồng” trong product spec vì vậy chưa hoàn tất.

Không thấy endpoint thiếu Auth cho dữ liệu chủ tài khoản, broadcast loadout/Scout,
metadata ledger thô, retry item tiêu hao hai lần, hay terminal gameplay phát trước
khi history terminal được lưu. `match:ended` có thể mang `result_pending` trước khi
side effect tài chính xong; đây là trạng thái được thiết kế, không phải “finished”.

Đã xử lý trong lượt contract hardening: OriginGuard cho hai claim nhận vàng;
idempotency `requestId` 5 phút cho invite accept/decline; payload nghiêm ngặt của
`match:snapshot`; tài liệu `totalMinutes`; quy ước revision/version và thời gian.
Clock không có tick event riêng và presence không có sequence được chấp nhận cho V1;
reconnect luôn phải lấy snapshot hiện tại. Presence/invite vẫn chỉ một backend instance.

## 8. Backend còn thiếu trước khi nối frontend

### A. Bắt buộc hoàn thành trước khi nối frontend V1 đầy đủ

- Chốt và triển khai backend chat trong trận: text + emoji, giới hạn 200 ký tự,
  chung quota 3 tin/5 giây/người, chỉ hai participant active, đóng khi terminal,
  không persistence/history. Cần contract ack/error/reconnect rõ.
- Hoàn thiện các API product-spec đã hứa nhưng chưa có: đổi nickname với cooldown,
  chọn avatar, quên/reset password và thu hồi session; nếu frontend V1 không có các
  màn này thì phải hạ phạm vi nghiệm thu bằng quyết định sản phẩm rõ ràng.
- Tạo hai type frontend riêng cho legacy revision và casual version khi bắt đầu nối
  UI; không dùng một type chung với field optional.

### B. Có thể làm sau khi frontend cơ bản đã nối

- Chuẩn hóa casing error code và envelope Socket trong version contract kế tiếp.
- Thêm sequence cho presence/relationship hoặc cơ chế explicit resync.
- Tài liệu OpenAPI/schema sinh máy; hiện audit/source là nguồn đọc thủ công.
- Redis/multi-instance cho presence, invite và room; persistence bàn/clock.

### C. Ngoài phạm vi V1 đã chốt

- Chat riêng, voice, push notification, last-seen, replay.
- Ranked/matchmaking/bot/leaderboard; nhân vật/skin; bán lại vật phẩm.
- Lặp thế, chiếu dai, đuổi dai.

## 9. Các quyết định cần người dùng chốt

1. Chat reconnect: chỉ nhận tin phát sinh sau reconnect hay server giữ buffer RAM
   ngắn để trả lại? Nếu giữ, tối đa bao nhiêu tin/thời gian?
2. Emoji: danh sách server allowlist bằng code hay cho phép Unicode emoji tự do?
   Tin có được trộn chữ + emoji hay là hai loại message riêng?
3. Mute là hoàn toàn client-side (đúng tính riêng tư, không cần báo đối thủ) hay
   server lưu trong phiên/trận? Mute có chặn dấu báo tin mới như spec yêu cầu không?
4. Rate-limit vượt ngưỡng trả ack code nào, có `retryAfterMs` không, và tin bị từ
   chối có tính vào quota không?
5. Chat mở chính xác khi history start commit hay khi match snapshot active; đóng ở
   `result_pending` hay chỉ `finished`? Đề xuất đóng ngay khi gameplay terminal.
6. Đổi nickname/avatar/quên mật khẩu thuộc frontend V1 sắp nối hay tách checkpoint
   backend riêng trước đó?

## 10. Checklist frontend theo màn hình

- **Auth/OTP:** giữ access token trong memory; cookie refresh HttpOnly; không log
  token/OTP; không retry POST; map code an toàn; refresh mất response theo contract.
- **Sảnh:** gọi `/me`, wallet/check-in/missions/Friends riêng; kết nối `/friends`,
  refetch khi `relationship:changed`; không suy nickname/presence từ cache cũ.
- **Tạo/vào phòng:** chờ SeatResponse; giữ seatToken bí mật; handshake accessToken
  đúng account; parse `timeControl`, `bet`, `itemsEnabled`.
- **Phòng chờ:** owner-only config; loadout chỉ own; ready ack không đồng nghĩa match
  đã start; invite accept không tự ready.
- **Bàn đấu:** authoritative `match:state`; action luôn UUID requestId + expectedVersion;
  clock nội suy từ serverNow/deadline; không optimistic consume item/result/payment;
  Scout/ownLoadout không đưa vào state dùng chung giữa hai người.
- **Kết quả:** phân biệt `result_pending`/`finished`, wager pending và reward pending;
  không cộng balance cục bộ; refetch wallet/history sau commit.
- **Shop/kho:** catalog/giá từ server; purchase requestId ổn định; không retry payload
  khác; loadout 0–3 và không làm giảm kho.
- **Điểm danh/nhiệm vụ:** không gửi date/timezone/cycle/progress/amount; xử lý conflict
  claim; chỉ nhận balance chính chủ từ success.
- **Lịch sử:** cursor opaque; ngày Việt Nam; friend detail gameplay-only; 404 dùng
  chung cho không tồn tại/không quyền.
- **Friends:** search exact; block không giải thích cho phía kia; presence là advisory;
  invite sống 60s/không giữ ghế; accept/decline giữ nguyên requestId khi retry trong
  5 phút; resync sau reconnect hoặc event không chắc thứ tự.
- **Chat:** chưa nối cho tới khi các quyết định mục 9 và contract backend được chốt.

## 11. Bằng chứng source chính

- HTTP: `apps/server/src/**/*controller.ts`, các `*pipe.ts`,
  `apps/server/src/http-error.filter.ts`.
- Socket: `apps/server/src/rooms/rooms.gateway.ts`, `match-engine.ts`,
  `move-request.ts`, `resign-request.ts`; `apps/server/src/friends/*.ts`.
- Persistence/lifecycle: `rooms.service.ts`, wallet/items/missions/check-in/history
  services và `apps/server/src/db/schema.ts`.
- Đặc tả đối chiếu: `docs/xiangqi-product-spec.md` cùng các tài liệu backend Auth,
  OTP, waiting room, clock, wallet, shop/loadout, match, item, reward, check-in,
  missions, history và Friends.
# Bổ sung hợp đồng chat trong trận

Chat dùng `/rooms` với `match:chat:send` và `match:chat:snapshot`; server phát `match:chat:message` và `match:chat:closed`. Payload được kiểm tra strict, participant authorization dựa trên socket đang sở hữu ghế, requestId idempotent theo account/trận, và snapshot chỉ chứa dữ liệu chat công khai. Chat không mở rộng payload gameplay riêng tư và không làm lộ loadout, Scout, inventory hoặc wallet. Chi tiết tại `casual-match-chat-backend.md`.

## Bổ sung hồ sơ và password reset

`GET /profile` và catalog avatar chỉ đọc identity hiện tại; mutation nickname/avatar dùng Auth + Origin và payload strict. Password reset dùng response generic, OTP purpose riêng và revoke toàn bộ refresh session. Không mở rộng match/history DTO, không seed avatar và không lưu plaintext OTP/password. Chi tiết tại `profile-password-reset-backend.md`.
