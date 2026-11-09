# Ví vàng nội bộ và cược Giải trí — backend

Nhánh `master`, nền commit `e3ea4a4`, thay đổi mới còn trong diff. Giữ nguyên diff phòng chờ/đồng hồ trước lượt này. Không triển khai thưởng thắng 5 vàng, vật phẩm khởi đầu, điểm danh, nhiệm vụ, cửa hàng, kho hoặc UI.

## Migration và số dư

- Migration mới `apps/server/drizzle/0002_colorful_titanium_man.sql`, cùng `meta/0002_snapshot.json` và cập nhật journal. Sinh bằng `drizzle-kit generate`, đọc SQL trước `drizzle-kit migrate`; không sửa migration 0000/0001.
- Bảng `wallets`: accountId, availableGold, heldGold, version. Số vàng là số nguyên; PostgreSQL CHECK không âm và tổng không vượt Number.MAX_SAFE_INTEGER. Dùng availableGold để kiểm tra khoản cược mới; totalGold = availableGold + heldGold.
- `wallet_entries`: accountId, entryNo tăng dần trong ví, operationKey duy nhất theo ví, reason, matchId, availableDelta, heldDelta, availableAfter, heldAfter, createdAt. Khóa ledger và bản ghi cược chống phát/trừ lặp. Mọi thay đổi số dư và lịch sử cùng transaction.
- `wagers`: matchId UUID duy nhất, roomCode, hai tài khoản, stake, status, result, createdAt/resultAt/settledAt. Giữ FK để không xóa ví có dữ liệu cược một cách vô tình.
- Quà **100 vàng sau xác minh email**, theo đặc tả. Migration cấp cho tài khoản cũ đã xác minh. Trigger khi insert tài khoản đã xác minh hoặc cập nhật emailVerifiedAt gọi `grant_wallet_starter`; cấp ví và ledger starter trong cùng transaction xác minh. PK ví + operation key chống retry/cạnh tranh. Chưa xác minh chưa có ví và chưa nhận vàng. Không cấp lại khi đăng nhập, tải lại, cập nhật lại emailVerifiedAt hoặc gọi grant nhiều lần.
- Trigger/function là SQL bổ sung trong migration mới; Drizzle schema mô tả các bảng/constraint/index. Không tự đồng bộ schema khi khởi động.

Đã áp dụng trên **xiangqi_dev, role xiangqi_app**; SELECT 1 = 1. Chạy lại migrate không thêm migration thứ hai cho bước này: lịch sử vẫn có 3 bản ghi 0000/0001/0002.

## Cược và tính nguyên tử

- POST tạo phòng vẫn mặc định không cược. Chủ dùng API cấu hình riêng để chọn stake nguyên từ 0 tới vàng khả dụng. 0 tắt cược. Khách/ngoài phòng bị từ chối; cả hai phải chưa Sẵn sàng; bắt đầu thì khóa.
- Khi đủ Sẵn sàng, phòng đặt promise bắt đầu và matchId trước khi await DB. Các request Sẵn sàng đồng thời/retry dùng cùng lần bắt đầu. Thay đổi cấu hình/bỏ Sẵn sàng/rời chủ động bị chặn trong lúc đang giữ cược; mất kết nối vẫn được xử lý.
- Transaction hold tạo wager và khóa hai ví theo thứ tự accountId, kiểm tra availableGold ngay trong transaction, chuyển available sang held và thêm hai ledger. Nếu thiếu bất kỳ bên nào, rollback toàn bộ; bên thiếu phải Sẵn sàng lại. DB lỗi không bắt đầu trận.
- Chỉ tạo bàn/đồng hồ và phát trạng thái chơi sau commit. Kiểm tra lại cùng phòng/ghế/Sẵn sàng/socket sau await. Nếu trạng thái đổi, hoàn wager `start_aborted`, không tạo trận.
- Commit thành công nhưng mất response: tra cứu cùng matchId và hoàn trước khi mở lại phòng. Nếu DB còn lỗi, khóa lần bắt đầu, giữ vàng chưa khả dụng và retry dọn; không cho bắt đầu lần mới trong lúc chưa biết kết quả commit cũ.
- Không cược giữ luồng đồng bộ cũ, không gọi hold và không tạo wager/ledger giữ cược.

## Quyết toán và khôi phục

Kết quả trận và trạng thái quyết toán là **hai dữ liệu khác nhau**. Khi trận kết thúc trong RAM, kết quả có thể được phát ngay; `bet.pending` cho biết vàng chưa xong. Backend ghi kết quả vào DB thành result_pending, sau đó transaction quyết toán khóa wager + hai ví, ghi ledger và chuyển trạng thái cùng commit.

| Kết quả server | Quyết toán cược | Thưởng thắng 5 vàng |
| --- | --- | --- |
| checkmate, stalemate, turn_timeout, total_timeout | Người thắng nhận cả quỹ | Chưa triển khai |
| resignation, disconnect_timeout | Người thắng nhận cả quỹ | Không thuộc chính sách thưởng |
| draw / agreement | Hoàn đúng stake từng bên | Không |
| cancelled / both_disconnected | Hoàn đúng stake từng bên | Không |
| cancelled / backend_restart hoặc start_aborted | Hoàn đúng stake từng bên | Không |

Luồng xin hòa chưa có trong V1; lớp quyết toán đã kiểm thử kết quả hòa để không cần thay chính sách vàng khi bổ sung sau. Reason lạ bị từ chối, không tự chọn người nhận vàng. Không có API cho client ghi kết quả hoặc quyết toán.

- held: đã giữ cả hai, chưa có kết quả lưu bền vững.
- result_pending: kết quả đã bền vững, vàng còn giữ tới khi quyết toán commit.
- settled: đã trả quỹ theo thắng/thua.
- refunded: đã hoàn vì hòa/hủy hoặc khôi phục.

Retry theo matchId không giữ/trả thêm vàng và không cho thay kết quả đã lưu. Thất bại khi ghi kết quả hoặc payout được retry mỗi 2 giây khi tiến trình còn sống; không log exception/SQL/payload. Lịch sử chỉ xuất hiện sau commit. Khi cần kiểm tra thủ công trong code/test có `RoomsService.retrySettlements()`; không có endpoint công khai thao tác vàng.

Startup `main.ts` lấy PostgreSQL advisory lock dành cho backend duy nhất, rồi recover, rồi mới listen. Backend thứ hai không được khôi phục trên trận đang sống của backend thứ nhất. Mất kết nối giữ khóa thì tiến trình dừng. Khi shutdown bình thường, RoomsService dừng lịch mới và chờ giao dịch đang chạy kết thúc, sau đó DatabaseService mới nhả khóa/đóng pool.

Recover quét held/result_pending: held ghi hủy backend_restart và hoàn; result_pending trả theo kết quả đã lưu. Kể cả UI từng thấy người thắng nhưng DB còn held thì hoàn. settled/refunded không đụng lại. Nếu recover lỗi, backend chưa nhận request/trận mới; restart lại tiếp tục từ trạng thái DB. Đây vẫn là **một backend instance**, chưa lưu bền bàn cờ và không hỗ trợ nhiều instance.

## API cho UI lượt sau

Browser sau này gọi cùng origin qua Next proxy; lượt này chưa thêm proxy/frontend. Các endpoint dưới đây là NestJS, dùng access token Auth hiện có. Không nhận accountId từ client để chọn ví.

| Endpoint | Body/query | Response |
| --- | --- | --- |
| GET `/wallet` | Không cần | Số dư của tài khoản đăng nhập |
| GET `/wallet/history` | `limit` 1–100, mặc định 20; `before` là entryNo từ nextCursor | `{ items, nextCursor }`, mới trước |
| GET `/wallet/bets/:matchId` | UUID | Trạng thái cược chỉ cho một trong hai người; người ngoài nhận 404 |
| POST `/casual-rooms/:code/bet` | `{ "stake": 20 }` | 200 `{ "ok": true }` |

GET không đăng nhập trả 401. Query `accountId` và route ví tài khoản khác không được hỗ trợ; không thể xem ví/lịch sử người khác. HTTP có no-store, x-request-id và lỗi Base `{statusCode,code,message}`. Mã chính: INVALID_BET 400, INSUFFICIENT_GOLD 409, PLAYERS_READY 409, NOT_ROOM_OWNER 403, ROOM_STARTING 409, ROOM_START_ABORTED 409, BET_NOT_FOUND 404; lỗi DB trả thông báo nội bộ an toàn với status 503 ở bước bắt đầu. Không tự retry POST từ browser.

Ví dụ GET wallet trước cược:

```json
{"availableGold":100,"heldGold":0,"totalGold":100,"version":1}
```

Sau giữ 20:

```json
{"availableGold":80,"heldGold":20,"totalGold":100,"version":2}
```

Lịch sử (mẫu, timestamp và matchId minh họa):

```json
{
  "items":[{
    "entryNo":2,"reason":"bet_hold",
    "matchId":"d1a4ba2f-8dd7-4a4b-84dd-734ff13c6f7e",
    "availableDelta":-20,"heldDelta":20,
    "availableAfter":80,"heldAfter":20,
    "createdAt":"2026-11-10T00:00:00.000Z"
  }],
  "nextCursor":2
}
```

Biến động tổng vàng = availableDelta + heldDelta; giữ cược chỉ chuyển ngăn nên tổng delta bằng 0. Khi trả quỹ 40, người thắng có availableDelta +40 và heldDelta -20, lãi tổng +20; người thua availableDelta 0, heldDelta -20. Không cộng 5 vàng. Sau hoàn: availableDelta +20, heldDelta -20.

`room:state` casual và `game:state` casual thêm `bet`:

```json
{
  "bet":{
    "stake":20,
    "matchId":"d1a4ba2f-8dd7-4a4b-84dd-734ff13c6f7e",
    "status":"result_pending",
    "starting":false,
    "pending":true
  }
}
```

Không cược: stake 0, matchId null, status none. Khi chờ: status none. Giữ thành công: held. Nếu trận kết thúc nhưng ghi kết quả lỗi, status vẫn held và pending true. Chỉ hiện “đã quyết toán” khi settled/refunded và pending false; hiển thị kết quả bàn theo `game.result` độc lập. GET bet cung cấp matchId, roomCode, stake, status, result và ba timestamp, không trả ID hai tài khoản.

**Danh sách tích hợp frontend:** validator `room:state` cần nhận timeControl và bet; validator `game:state` nhận clock, bet và reason turn_timeout/total_timeout; nối Next proxy cho ví/lịch sử/chi tiết cược và API cấu hình time-control/bet. Sau đó mới nối UI đồng hồ, số dư, mức cược và tình trạng chờ quyết toán. Không lấy Playwright cũ làm chứng cứ frontend đã hỗ trợ payload này.

## File và kiểm tra

Phần mới ví/cược: schema, migration 0002 + meta/journal; `src/wallet/*`; `app.module.ts`, `rooms.module.ts`, `main.ts`, `database.service.ts`; bổ sung service/types/pipe/controller phòng; HTTP filter; script/package `test:wallet`; tài liệu này và các quy tắc đã chốt trong đặc tả. Diff AGENTS, clock helper/test/tài liệu, sửa reconnect phòng chờ, next-env và hai ảnh nghiệm thu là thay đổi có sẵn, được giữ nguyên.

```powershell
npm.cmd run db:generate --workspace=@xiangqi/server
npm.cmd run db:check --workspace=@xiangqi/server
npm.cmd run db:migrate --workspace=@xiangqi/server
npm.cmd run test:wallet --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/server
git diff --check
```

`test:wallet` dùng PostgreSQL thật với schema ngẫu nhiên `wallet_test_<uuid>`, tạo bảng bằng SQL migration và chỉ chuyển FK public sang schema test. Có fixture tài khoản cũ trước migration 0002, đăng ký/OTP giả mail, Auth thật, HTTP và Socket.IO thật. Không có database test riêng trên máy; role xiangqi_app không có CREATEDB. Không sửa bảng/ví thật khi inject lỗi. Test dọn schema theo tên đã kiểm tra sau chạy. Không in token, OTP, mật khẩu hoặc DATABASE_URL. Chạy backend dev được trong lúc test: khóa runtime test dùng slot riêng.

Các ca bao gồm: quà cũ/mới/cạnh tranh; quyền/pagination; giữ/settle lặp; hai match cùng dùng một số dư; mọi reason thắng, hòa/hủy; recover held/result_pending hai lần; DB lỗi khi ghi ví thứ hai; không cược; cấu hình; thiếu vàng; Sẵn sàng đồng thời/retry; lost commit response; disconnect lúc hold; cleanup lỗi rồi retry; payout lỗi giữa transaction; result_pending retry; kết quả xuất hiện nhưng chưa lưu; timer tự quyết toán; khóa backend và shutdown trong lúc hold commit.

Kết quả thực tế: `test:wallet` **20 pass, 0 fail, 0 skip** (19 ca và bài tổng); `test` backend **73 pass, 0 fail, 0 skip**, gồm đồng hồ/phòng chờ/V1. Typecheck, build backend và `git diff --check` đạt. Migration đã chạy và chạy lại đạt. Không có lý do skip vì không bỏ qua ca nào trong hai bộ test này.

Tự thử backend: dùng hai tài khoản đã xác minh đăng nhập để lấy access token trong công cụ API local, xem GET wallet; tạo/vào phòng, nối Socket.IO bằng seat token + access token; POST bet trước Sẵn sàng; cả hai ready; xem available/held; đầu hàng hoặc chờ 60 giây rồi xem GET bet và wallet/history. Không gửi token hoặc OTP vào chat. Chạy test:wallet để thử lỗi/restart bằng fixture biệt lập thay vì sửa dữ liệu thật.

Chưa chạy frontend/Playwright trong lượt backend này. Chưa triển khai xin hòa UI/endpoint, thưởng 5 vàng hay bảng lịch sử trận đầy đủ. Không commit/push/deploy.
