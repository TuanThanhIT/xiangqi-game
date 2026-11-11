# Trận Giải trí online — backend làm trọng tài

Nhánh `master`, nền `a8d38bb` (`feat(items): add shop inventory and pre-match loadouts`).
Lượt rà soát ngày 2026-11-12 được duyệt commit với message
`feat(casual): add server-authoritative online matches`; không push/deploy.
Không thêm dependency, migration, frontend, thưởng 5 vàng hoặc hành động vật phẩm.
Migration mới nhất vẫn là `0003_thin_payback.sql`.
So với ref `origin/master` tại máy khi bắt đầu: ahead 3 / behind 0; không fetch remote.

## Phạm vi và kiến trúc

`packages/rules` đã có hình học đủ 7 quân, mô phỏng nước đi, an toàn Tướng,
phát hiện chiếu, liệt kê mọi nước hợp lệ và xác định chiếu bí/hết nước.
Lượt này bổ sung kiểm tra cấu trúc thế cờ tại các API luật hoàn chỉnh:
ID/ô không trùng, loại quân/phe/tọa độ hợp lệ; thế cờ vẫn cần đúng một Tướng mỗi phe.
Không ép vị trí quân phải phát sinh từ một lịch sử ván cờ cụ thể.

Các hàm `can*MoveByGeometry` chỉ kiểm tra hình học, vật cản và quân đích;
không dùng chúng để chấp nhận nước online. `isLegalMove` mô phỏng trên dữ liệu mới,
kiểm tra chiếu sau nước đi và không cho ăn Tướng. `getLegalMoves` duyệt mọi quân,
không kết luận chiếu bí chỉ từ ô thoát của Tướng.

`room-game.ts` tạo/chuyển bàn bất biến, ghi moveNumber và quân bị ăn.
`match-engine.ts` giữ kiểu dữ liệu, parser và domain cầu hòa.
`RoomsService` điều phối quyền ghế, deadline, commit bàn/cache và wager/loadout.
`RoomsGateway` xác thực handshake hiện có và chuyển event đến service.
Luật quân không được sao chép vào gateway hoặc service.

Backend vẫn là một process Node, một chủ PostgreSQL advisory lock. Trong một
hành động gameplay không có `await` giữa kiểm tra và commit. Hai request được
xử lý tuần tự, version bảo đảm một lượt chỉ áp dụng một nước. Ghi/settle cược
bất đồng bộ sau khi khóa kết quả; mọi hành động mới bị chặn trong lúc đó.

## Luật đã hỗ trợ và giới hạn

- Xe ngang/dọc, không nhảy quân, không ăn cùng phe.
- Pháo đi không màn khi không ăn; ăn qua đúng một màn.
- Mã chữ L và cản chân; Tượng chéo hai ô, cản mắt, không qua sông.
- Sĩ chéo một ô trong cung; Tướng ngang/dọc một ô trong cung.
- Tướng đối mặt là chiếu; không được đi nước tự chiếu; đang chiếu phải hóa giải.
- Tốt chỉ tiến trước sông, tiến/ngang sau sông, không lùi.
- Chiếu, bắt/chặn quân chiếu, mọi nước hợp lệ, chiếu bí và hết nước không chiếu.

Người dùng đã chốt trong lượt này: **bên hết nước hợp lệ bị xử thua**, kể cả
không bị chiếu (`stalemate`). Không đổi luật hiện có của package.
Chưa hỗ trợ lặp thế, trường chiếu, trường tróc hoặc hòa sau số nước nhất định.
Không tự đặt thêm quy tắc cho những trường hợp đó.

## Trạng thái và định danh

Mọi trận casual có `gameMatchId` UUID, kể cả không cược và tắt vật phẩm.
UUID được tạo một lần khi đủ Sẵn sàng. Nếu có cược/vật phẩm, dùng UUID của lần
chuẩn bị hiện có; chỉ tạo game/clock/session sau khi snapshot loadout và hold
thành công, kiểm tra lại phòng/ghế/socket. Không có cược thì không tạo wager.
Tắt vật phẩm thì không gọi ghi snapshot DB, loadout trong snapshot trận là `[]`.

`Room` trong RAM giữ ghế hai tài khoản, game, gameClock, match session và trạng
thái wager. Game giữ pieces, sideToMove, lastMove, revision, moveNumber, captured,
result. Session giữ id, startedAt, drawRevision, đề nghị hòa, số lần/cooldown mỗi
bên, bản sao loadout đã khóa và cache request theo ghế. Không trả session thô.

`stateVersion = game.revision + match.drawRevision`: nước đi/kết thúc tăng revision;
tạo/đóng/hết hạn đề nghị tăng drawRevision. `moveNumber` chỉ tăng khi đi quân.
Kết thúc có thể đóng đề nghị nên version có thể tăng hơn một. Không suy luận
số nước từ version. Kết nối và trạng thái quyết toán có thể đổi mà version
gameplay không đổi; frontend phải cập nhật các trường đó từ snapshot mới.

Snapshot riêng gồm:

| Trường | Ý nghĩa |
|---|---|
| matchId, roomCode, viewerSide, players | Trận, ghế của người xem, nickname hai bên |
| board, sideToMove, moveNumber, stateVersion, captured | Bàn và tiến độ từ server |
| startedAt, serverNow, clock | Thời gian server, đơn vị ms |
| inCheck | Tướng của sideToMove đang bị chiếu |
| status | active / result_pending / finished / cancelled |
| result, reason | null khi active, kết quả đã khóa khi kết thúc |
| drawOffer | Đề nghị gần nhất: id, side, createdAt, expiresAt, status |
| drawCounts, ownDrawAvailableAt | Bộ đếm hai bên và mốc cooldown của chính mình |
| ownLoadout | Chỉ loadout của người xem, không chứa của đối thủ |

`drawOffer.status` là pending / accepted / rejected / expired / closed.
`result_pending` nghĩa đã có kết quả trong RAM nhưng wager chưa settle/refund
thành công, gồm cả trường hợp ghi kết quả DB thất bại. Nó **không bảo đảm** kết quả
đã lưu bền vững; xem giới hạn restart bên dưới. Không cược thì kết thúc ngay.
Không trả accountId, seat token, digest, cache request hoặc dữ liệu DB nội bộ.

## Socket.IO và payload

Namespace `/rooms`, Origin và handshake giữ nguyên. Casual cần cả accessToken
của tài khoản và seatToken đúng ghế. Kết nối mới xác thực lại, thay socket cũ;
chỉ socket đã attach đang giữ ghế được xem snapshot hoặc gửi hành động.
Không có endpoint cho client tự ghi bàn/kết quả hoặc quyết toán vàng.

| Client → server | Payload / ack |
|---|---|
| match:snapshot | `{}`; `{ok:true,snapshot}` hoặc `{ok:false,code}` |
| match:move | Base + `from:{row,col}`, `to:{row,col}` |
| match:resign | Base |
| match:draw:offer | Base |
| match:draw:accept | Base + `offerId` |
| match:draw:reject | Base + `offerId` |

Base là `{matchId:UUIDv4,requestId:UUIDv4,expectedVersion:integer>=0}`.
Parser từ chối trường thừa, tọa độ ngoài bàn/phân số hoặc body không hợp lệ.
Không nhận thời gian, quân bị ăn, lượt, bàn mới hoặc kết quả từ client.
Ví dụ:

```json
{
  "matchId": "11111111-1111-4111-8111-111111111111",
  "requestId": "22222222-2222-4222-8222-222222222222",
  "expectedVersion": 0,
  "from": {"row": 6, "col": 0},
  "to": {"row": 5, "col": 0}
}
```

Ack thành công: `{ok:true,requestId,stateVersion}`. Ack lỗi:
`{ok:false,requestId,code,currentVersion?}`. Request sai dạng có requestId null.
Ack là kênh báo chấp nhận/từ chối hành động, không có event ack trùng riêng.

| Server → client | Nội dung |
|---|---|
| match:state | Snapshot riêng, khi bắt đầu/đi quân/cầu hòa/reconnect/kết thúc/quyết toán |
| match:check | `{matchId,stateVersion,side}` khi snapshot active đang chiếu |
| match:ended | Snapshot có kết quả, có thể result_pending rồi finished |
| match:draw:state | `{matchId,stateVersion,offer}`; expired là thông báo hết hạn |

Các thông báo là đồng bộ trạng thái, có thể lặp lại khi reconnect hoặc quyết toán;
không có nghĩa nghiệp vụ được thực hiện thêm lần nữa. Client không thưởng vàng
hoặc tự quyết toán dựa trên số lần nhận event. Snapshot chứa serverNow để đồng bộ.
Gateway gửi snapshot từng socket, không broadcast ownLoadout vào room chung.

Giữ nguyên `room:state`, `room:session`, `room:replaced`, `room:left`, `game:state`,
`game:move`, `game:resign` và hợp đồng HTTP V1. `game:state` vẫn không chứa loadout,
không thêm key vào payload bàn V1. Payload match mới là hợp đồng bổ sung.

## Luồng nước đi, idempotency và lỗi

Service kiểm tra socket/account/ghế, phân xử deadline, parse request, matchId,
cache/conflict, trạng thái và version. Sau đó tra quân từ `from`, kiểm tra lượt,
quyền quân và `isLegalMove`; tạo bàn tiếp theo bằng domain. Kiểm tra deadline
lần nữa **sau** tính luật/kết quả, trước commit. Deadline đúng hạn cũng bị từ chối.
`expectedVersion` cũng được kiểm tra lại sau phân xử deadline, ở đầu và cuối
luồng đi quân/đầu hàng. Nếu đề nghị hòa hết hạn trong lúc xử lý làm version tăng,
request cũ trả `stale_version`; không ghi bàn, chuyển lượt hoặc chốt đầu hàng.
Hợp lệ mới ghi board/captured/moveNumber/revision, chuyển clock và phát trạng thái.
Nước sai không đổi bàn/lượt/version/mốc clock hoặc phát sinh kết quả ngoài timeout
thật của server. Không đụng kho hoặc vật phẩm.

Cache theo `(ghế, requestId)`, fingerprint gồm action và toàn bộ payload đã chuẩn
hóa. UUID không phân biệt hoa/thường, thứ tự key JSON không ảnh hưởng fingerprint.
Cùng key/cùng payload trả ack cũ; khác payload/action bị từ chối. Version cũ trả
`stale_version` kèm currentVersion; client lấy snapshot mới, không tự retry POST.
Retry không reset clock hoặc 15 giây cầu hòa. Hai ghế có namespace key riêng.

Cache match và cache gameplay casual giữ trong suốt vòng đời phòng RAM để retry
muộn vẫn an toàn. Phòng V1 cũ giữ eviction 256 như trước. Không được tái sử dụng
key giữa giao thức V1 và match; gửi qua giao thức kia bị conflict. Riêng response
cầu hòa đến sau kết thúc luôn `match_not_active`, kể cả retry từng thành công.

Mã lỗi match: `socket_not_active`, `invalid_match_request`, `match_not_found`,
`match_not_active`, `request_id_conflict`, `stale_version`, `not_your_turn`,
`illegal_move`, `players_offline`, `game_finished`, `internal_error`.
Lỗi cầu hòa: `draw_offer_limit_reached`, `draw_offer_cooldown`,
`draw_offer_already_pending`, `draw_offer_not_found`, `draw_offer_forbidden`,
`draw_offer_expired`. Gateway che exception nội bộ, không log payload/token.
V1 tiếp tục mã lỗi viết hoa và expectedRevision/pieceId.

## Clock và reconnect

Giữ clock đã duyệt: Đỏ trước; tổng 5/10/15/20/30 phút; mỗi lượt 60 giây.
Chỉ bên đang đi mất quỹ tổng. Hạn thực tế là min(turnDeadlineAt,totalDeadlineAt).
Đúng hạn là hết giờ. Retry, nước sai, đề nghị hòa và reconnect không cấp lại giờ.
Khi chốt dừng ở thời điểm phân xử, kể cả timer chạy muộn.

Giữ thứ tự deadline hiện có: so thời điểm đủ điều kiện xử lý, thi đấu thắng tie
với offline, tổng thắng tie với lượt. Cả hai offline quá hạn có thể hủy theo
chính sách cũ; một người quá hạn trong khi đối thủ còn offline chưa quá hạn chưa
đủ để chốt thắng offline. Không thay chính sách giữ ghế 60 giây.
Timer gồm deadline thi đấu/offline và expiry đề nghị hòa; callback cũ có version
và room identity nên không thể kết thúc lượt/trận mới.

Refresh dùng lại roomCode/seatToken và accessToken; nhận match:state hoặc gọi
match:snapshot. Giữ phe, bàn, lượt, counters, captured, cooldown/expiry, clock,
matchId và loadout đã khóa. Không giữ cược/snapshot DB lần hai. Socket bị thay
thế không được điều khiển hoặc xem snapshot riêng. Sau restart không phục hồi
ghế/trận từ DB; reconnect về trận cũ không thành công.

## Đầu hàng, cầu hòa và kết quả

Đầu hàng không yêu cầu đúng lượt hoặc đối thủ online. Chỉ active; đối thủ thắng,
clock dừng, kết quả khóa một lần. Retry cùng requestId trả ack cũ.

Mỗi bên tối đa 3 đề nghị, hai lần gửi cách nhau ít nhất 60 giây. Một đề nghị
pending tại một thời điểm, hiệu lực 15 giây. Clock chạy kể cả khi đang chiếu;
vẫn được gửi khi đang chiếu. Người gửi không tự rút/đồng ý/từ chối đề nghị.
Chỉ đối thủ đồng ý hoặc từ chối; accept chốt hòa/refund, reject tiếp tục chơi.
Đúng 15 giây là expired, timer tự phát trạng thái. Reconnect giữ counters và mốc.
Một offerId đã đóng không được dùng để phản hồi đề nghị khác.

Hết giờ hoặc kết thúc khác ưu tiên trước response cầu hòa; pending offer bị đóng.
Không có await giữa kiểm tra deadline, đổi đề nghị và commit kết quả. Request
đồng thời/timeout/đầu hàng không tạo kết quả hoặc payout lần hai.

| result.status | reason | Hành vi cược |
|---|---|---|
| finished | checkmate, stalemate | Chuyển cả quỹ cho winner |
| finished | total_timeout, turn_timeout | Chuyển cả quỹ cho winner |
| finished | resignation, disconnect_timeout | Chuyển cả quỹ cho winner |
| draw | agreement | Hoàn stake từng bên |
| cancelled | both_disconnected | Hoàn stake từng bên |

Recovery có reason backend_restart; hủy lần chuẩn bị có start_aborted trong
wager, không phải trận active mới. Không triển khai thưởng 5 vàng.

## Wager, lỗi DB và restart

Giữ luồng `recordResult(matchId,result)` rồi `settle(matchId)` hiện có. Khóa kết
quả trong RAM trước khi await. Wager DB có held / result_pending / settled /
refunded. DB ghi kết quả lỗi: held + snapshot result_pending. Ghi xong nhưng
payout lỗi: DB result_pending, snapshot result_pending. Vàng vẫn held trong cả
hai trường hợp, không trở lại available trước transaction quyết toán commit.
Retry mỗi 2 giây hoặc `RoomsService.retrySettlements()` nội bộ, không endpoint.
Transaction/quy tắc matchId của BettingService chống quyết toán lặp và đổi kết quả.

Startup giữ advisory lock rồi recover xong mới listen. Restart mất mọi phòng,
bàn, clock và cache RAM. Wager held chưa có kết quả bền vững được ghi hủy
backend_restart rồi hoàn hai bên. Wager result_pending quyết toán theo **kết quả
DB đã lưu**. Recover hai lần không trả vàng hai lần. settled/refunded giữ nguyên.

Vì vậy có cửa sổ người chơi thấy kết quả trong RAM nhưng DB vẫn held; nếu process
mất trong cửa sổ này, recovery sẽ hoàn cược thay vì giữ kết quả từng hiển thị.
Đây là chính sách hiện có được giữ lại và có test tái hiện. Không tuyên bố
phục hồi bàn active, lưu bền toàn bộ trận, nhiều instance hoặc exactly-once event.
Không thêm Redis. Match/cache giữ RAM theo vòng đời phòng hiện có; chưa bổ sung
chính sách dọn phòng kết thúc hoặc hạn mức request mới trong lượt này.

## Frontend cần nối và cách tự thử

Chưa sửa frontend. Dùng công cụ API và Socket.IO local với hai tài khoản đã xác
minh; không gửi access token/seat token/OTP vào chat hoặc log.

1. Đăng nhập A/B; tạo và vào phòng casual bằng API hiện có. Nối namespace /rooms
   bằng roomCode, seatToken, accessToken và Origin được phép.
2. Tùy chọn cấu hình stake/items/loadout trước Sẵn sàng. Đặt cả hai ready.
3. Nhận match:state; kiểm tra cùng matchId, viewerSide khác nhau, mỗi bên chỉ
   nhận ownLoadout. A gửi nước từ (6,0) đến (5,0) qua match:move, đúng version.
4. Gửi lại cùng request để thấy ack cũ; đổi to giữ requestId để thấy conflict;
   dùng requestId mới/version cũ để thấy stale_version. B đi tiếp rồi A ăn quân;
   kiểm tra moveNumber/captured và deadline chỉ đổi sau nước hợp lệ.
5. Refresh/thay socket A; lấy snapshot, xác nhận matchId/bàn/deadline giữ nguyên.
6. Gửi đề nghị hòa; thử tự accept (bị cấm), B reject hoặc chờ expiry. Sau cooldown
   gửi lại, B accept; kiểm tra result agreement, clock dừng, wager refunded và
   số dư hai bên trở lại trước cược. Dùng trận khác thử resign/timeout.
7. Dùng test clock giả và schema test để thử DB outage/restart thay vì sửa DB thật.

Checklist frontend: type/validator snapshot mới, namespace/event/ack/error mapping,
requestId giữ khi retry và không đổi payload; expectedVersion lấy từ snapshot;
board/captured/check từ server; countdown từ serverNow + deadline (không tự chốt);
ownLoadout riêng; UI cầu hòa counts/cooldown/expiry; result_pending phân biệt kết
quả với tiền đã quyết toán; reconnect/snapshot; xử lý state/event lặp. Hợp đồng
mới chưa được nối UI hoặc kiểm tra trình duyệt trong lượt này.

## Kiểm tra

Các lệnh chạy từ root, trừ script integration ghi rõ workspace directory:

```powershell
npm.cmd run test --workspace=@xiangqi/rules
npm.cmd run test --workspace=@xiangqi/server
node --test apps/server/.test-output/tests/match-engine.test.js apps/server/.test-output/tests/match-socket.test.js
node --test apps/server/.test-output/tests/casual-clock.test.js
npm.cmd exec --workspace=@xiangqi/rules -- tsc --noEmit -p tsconfig.build.json
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/rules
npm.cmd run build --workspace=@xiangqi/server
git diff --check
```

Sau build backend, từ `apps/server` chạy riêng, tuần tự:

```powershell
node --test scripts/test-wallet.cjs
node --test scripts/test-items.cjs
node --test scripts/test-auth.cjs
node --test scripts/test-registration.cjs
```

Wallet/items áp dụng toàn bộ migration hiện có vào schema ngẫu nhiên biệt lập rồi
dọn schema test. Auth/OTP tạo tài khoản fixture và dọn sau chạy, mail giả.
Không cần chờ thật 15/60 giây; test trận dùng clock kiểm soát được.
Kết quả chạy lại trong lượt rà soát ngày 2026-11-12 (match/clock nằm trong backend,
không cộng dồn chúng lần nữa):

| Lệnh / nhóm | Pass | Fail | Skip |
|---|---:|---:|---:|
| npm.cmd run test --workspace=@xiangqi/rules | 101 | 0 | 0 |
| npm.cmd run test --workspace=@xiangqi/server | 90 | 0 | 0 |
| node --test apps/server/.test-output/tests/match-engine.test.js apps/server/.test-output/tests/match-socket.test.js | 17 | 0 | 0 |
| node --test apps/server/.test-output/tests/casual-clock.test.js | 13 | 0 | 0 |
| node --test scripts/test-wallet.cjs (apps/server) | 21 | 0 | 0 |
| node --test scripts/test-items.cjs (apps/server) | 8 | 0 | 0 |

Không skip test nào trong các nhóm trên. Hai script integration Auth/OTP riêng
đã đạt ở lượt triển khai trước, không chạy lại trong lượt rà soát này; không dùng
kết quả cũ làm kết quả mới. Backend đầy đủ vẫn chạy test Auth/OTP input hiện có.
Wallet/items tính cả test tổng của nhóm theo số liệu Node runner.
Typecheck rules (`tsc --noEmit -p tsconfig.build.json` qua npm.cmd exec), typecheck
backend, build rules, build backend và `git diff --check` đều exit 0.
Git có cảnh báo chuẩn hóa LF/CRLF, không có lỗi whitespace. Không chạy frontend
hoặc Playwright.

Rà soát phát hiện request đi quân/đầu hàng vẫn được chấp nhận nếu expiry cầu hòa
làm `expectedVersion` cũ trong lúc xử lý. Hai regression test mới thất bại trước
bản sửa, đạt sau bản sửa; mỗi test kiểm tra cả khi đi vào handler bên trong và
ngay trước commit, đồng thời xác nhận retry, bàn/clock giữ nguyên và request mới
với version mới có thể tiếp tục. Bộ backend đầy đủ đã được chạy lại sau bản sửa.

Rà secret trên toàn bộ 16 file thuộc phạm vi commit: không phát hiện private key,
token thật, URL có credential hoặc giá trị secret trùng với `.env` local.
`apps/server/.env`, `apps/web/.env.local` được Git ignore; không sửa/đưa vào commit.
Mật khẩu/tài khoản cố định trong script test là fixture của schema biệt lập.
Schema `wallet_test_*`/`items_test_*` còn lại trước và sau hai bộ test đều bằng 0.
Log và output build/test không nằm trong phạm vi commit.

## Diff bàn giao

Commit nền `a8d38bb1b3f88e6972f5fb762a5845c4a2beaf5c`, branch `master`;
trước commit ahead 3 / behind 0 so với ref origin/master tại máy.
Trước lượt triển khai chỉ có ba file frontend bên dưới thay đổi (M).
Phạm vi commit sau rà soát gồm **10 file sửa + 6 file mới**:

| File | Trạng thái | Mục đích |
|---|---|---|
| apps/server/src/rooms/action-cache.ts | M | Giữ key suốt trận casual; giữ eviction phòng V1 cũ |
| apps/server/src/rooms/resign-request.ts | M | Lỗi version cũ khi handler nội bộ nhận expectedVersion từ match |
| apps/server/src/rooms/room-game.ts | M | Counters, captured, kết quả hòa |
| apps/server/src/rooms/rooms.types.ts | M | Session trong trạng thái phòng |
| apps/server/src/rooms/rooms.service.ts | M | MatchId, quyền/snapshot/hành động, deadline và tích hợp |
| apps/server/src/rooms/rooms.gateway.ts | M | Event match và phát snapshot riêng từng socket |
| apps/server/src/rooms/match-engine.ts | Mới | Parser, kiểu dữ liệu và domain cầu hòa |
| apps/server/tests/match-engine.test.ts | Mới | Test trận/clock giả/cạnh tranh/lỗi DB |
| apps/server/tests/match-socket.test.ts | Mới | Test Socket.IO thật và riêng tư/reconnect |
| apps/server/scripts/test-wallet.cjs | M | Hòa qua Socket.IO hoàn cược trong PostgreSQL thật |
| apps/server/scripts/test-items.cjs | M | Có matchId, tắt items vẫn không ghi snapshot |
| packages/rules/src/check.ts | M | Kiểm tra cấu trúc trước khi tính chiếu |
| packages/rules/src/legal-move.ts | M | Từ chối đích null/sai dạng |
| packages/rules/src/validate-position.ts | Mới | Xác thực cấu trúc thế cờ |
| packages/rules/tests/position-validation.test.ts | Mới | Dữ liệu sai và cứu chiếu bằng quân khác |
| docs/casual-online-match-engine.md | Mới | Tài liệu bàn giao này |

Ba thay đổi có sẵn được giữ nguyên: `apps/web/next-env.d.ts`,
`docs/design/screenshots/casual-waiting/waiting-desktop.png`,
`docs/design/screenshots/casual-waiting/waiting-mobile.png`.
Không chỉnh sửa ba file đó trong lượt này. Không có diff schema/migration,
dependency, .env hoặc mã frontend do nhiệm vụ này tạo ra.
