# Web cờ tướng

Dự án web cờ tướng để vừa học lập trình vừa triển khai thực tế, tổ chức trong một repository bằng npm workspaces.

## Trạng thái hiện tại

Frontend Next.js dùng TypeScript, App Router, thư mục `src`, ESLint và CSS thông thường. Hai người có thể chơi luân phiên trên cùng thiết bị, Đỏ đi trước: chọn/bỏ chọn, đi/ăn quân theo luật đã hỗ trợ, xem nước vừa đi và cảnh báo chiếu. Bàn SVG co giãn cho điện thoại, hỗ trợ chuột/chạm và bàn phím (Tab vào bàn, mũi tên chuyển giao điểm, Enter/Space xác nhận).

Trận kết thúc khi bên đến lượt hết nước hợp lệ: bị chiếu là chiếu bí, không bị chiếu vẫn thua vì hết nước (không hòa như cờ vua). Sau kết thúc không thể chọn/đi quân, vẫn điều hướng bàn phím được. Nút “Ván mới” tạo lại khai cuộc; hỏi xác nhận nếu đã đi và trận chưa kết thúc, hủy sẽ giữ nguyên trận.

Trạng thái local chỉ nằm trong bộ nhớ trình duyệt, tải lại trang sẽ mất ván. Chưa có chơi qua mạng hoặc lưu/khôi phục trận.

Backend NestJS có `GET /health`, API tạo/vào phòng trong bộ nhớ và Socket.IO xác thực ghế/trạng thái kết nối tại cổng 3001. Có allowlist origin riêng cho Socket.IO; chưa bật CORS cho HTTP API, chưa có database hoặc tích hợp rules. Workspace rules đã có kiểu dữ liệu, thế khai cuộc, hình học bảy quân, kiểm tra chiếu và an toàn của Tướng, xác thực nước đi, liệt kê nước hợp lệ và xác định kết thúc trận. Đây là luật đã hỗ trợ cho bản thử, chưa phải toàn bộ luật thi đấu: chưa hỗ trợ hòa thỏa thuận, lặp thế, chiếu dai/đuổi dai.

## Cài đặt và chạy frontend

Yêu cầu Node.js từ 20.9 trở lên cho Next.js 16.4.3. Máy hiện tại dùng Node.js v22.17.0. Xem [tài liệu cài đặt Next.js](https://nextjs.org/docs/app/getting-started/installation).

Chạy tại thư mục gốc repository trên Windows:

```powershell
npm.cmd install
npm.cmd run dev:web
```

Mở `http://localhost:3000` (hoặc cổng được terminal thông báo). Nhấn `Ctrl+C` để dừng server.

Dự án dùng một `package-lock.json` tại gốc. Không cài dependency riêng trong `apps/web`.

Kiểm tra frontend từ thư mục gốc:

```powershell
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
```

Lệnh `dev:web` ở gốc gọi script `dev` của workspace `@xiangqi/web`, chạy `next dev`. App Router dùng `apps/web/src/app/layout.tsx` làm khung trang và `apps/web/src/app/page.tsx` làm nội dung trang chủ. File `globals.css` chứa CSS chung; alias `@/*` trỏ tới `apps/web/src/*`.

## Phòng chờ tại /play

Trang `/play` cho nhập biệt danh để tạo phòng hoặc nhập thêm mã để vào phòng. HTTP đi qua hai Route Handler cố định của Next.js (`/api/rooms`, `/api/rooms/[code]/join`), Socket.IO kết nối trực tiếp backend namespace `/rooms`. Trang `/` và các trang kiểm tra kết thúc local giữ nguyên.

Tạo `apps/web/.env.local` trên máy từ `apps/web/.env.example` (không commit `.env.local`):

```dotenv
BACKEND_HTTP_URL=http://127.0.0.1:3001
NEXT_PUBLIC_BACKEND_SOCKET_URL=http://localhost:3001
```

`BACKEND_HTTP_URL` chỉ dùng ở Route Handler server. `NEXT_PUBLIC_BACKEND_SOCKET_URL` là địa chỉ công khai cho browser, được đưa vào bundle khi build; không đặt token vào biến môi trường này. Khởi động lại Next.js khi đổi cấu hình; build lại nếu đổi cấu hình public cho production. Không tạo proxy WebSocket qua Route Handler.

Mở hai terminal tại gốc repository:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:web
```

Frontend phải chạy tại `http://localhost:3000` hoặc `http://127.0.0.1:3000` theo allowlist socket hiện tại. Mở `/play` ở hai cửa sổ độc lập: A tạo phòng, sao chép mã; B nhập mã và biệt danh để vào. Khi đủ hai ghế chỉ báo đủ người, chưa có bàn cờ online. Ghế offline vẫn được giữ, không trở thành ghế trống.

Phiên mỗi tab lưu trong `sessionStorage`, được kiểm tra runtime trước khi dùng; reload chỉ kết nối socket lại, không POST lại. JavaScript cùng origin đọc được token; không coi sessionStorage là kho bí mật chống XSS. Nhân bản tab có thể sao chép phiên ban đầu và thay socket tab cũ. Khi bị `room:replaced` hoặc xác thực thất bại, client dừng reconnect và xóa credentials; nếu browser chặn xóa/ghi storage sẽ báo cần xóa dữ liệu trang/đóng tab. Nếu ghi storage thất bại, phiên chỉ giữ trong bộ nhớ và reload có thể mất ghế.

POST chỉ chạy từ submit, có khóa chống gửi trùng và timeout: 8 giây proxy, 12 giây browser. Không tự retry: timeout/mất response có thể xảy ra sau khi backend đã giữ ghế, và hiện chưa có cơ chế lấy lại token bị mất. Proxy chỉ gửi JSON nickname và Content-Type, không chuyển cookie/header browser; response no-store. Socket đăng ký listener trước connect, cleanup khi unmount, xác nhận phe sau `room:session` và loại callback của socket cũ. Thông tin snapshot lúc mất kết nối là dữ liệu lần gần nhất.

Thử thủ công: nickname/mã sai, người thứ ba nhận ROOM_FULL, reload không tạo phòng mới, đóng cửa sổ thấy offline, nhân bản tab thấy tab cũ bị thay thế, dừng backend/khởi động lại, clipboard/storage bị chặn, phím Tab/Enter và chiều rộng 375px. Không dán token vào URL, console hoặc ảnh chụp công khai.

## Chạy và kiểm tra backend

Backend dùng NestJS 12.3.2, CommonJS, được tạo thủ công; không cần Nest CLI. Node.js 22.17.0 hiện tại đáp ứng yêu cầu runtime. Cài dependency từ gốc bằng `npm.cmd install`, giữ duy nhất `package-lock.json` ở gốc.

Từ thư mục gốc, chạy:

```powershell
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/server
npm.cmd run dev:server
```

Development dùng nodemon và ts-node, tự khởi động lại khi sửa `apps/server/src`. Backend lắng nghe cổng 3001; frontend giữ nguyên lệnh/cổng hiện có. Chạy hai ứng dụng ở hai terminal riêng nếu cần.

Trong terminal khác, kiểm tra HTTP:

```powershell
$healthResponse = Invoke-WebRequest -UseBasicParsing http://localhost:3001/health
$healthResponse.StatusCode
$healthResponse.Headers['Content-Type']
$healthResponse.Content
```

Kỳ vọng HTTP `200`, Content-Type JSON và nội dung `{"status":"ok"}`. Nhấn `Ctrl+C` để dừng development trước khi chạy bản build:

```powershell
npm.cmd run start --workspace=@xiangqi/server
```

Gọi lại `/health` bằng lệnh trên, rồi `Ctrl+C` để dừng. Build xóa `apps/server/dist` cũ trước khi biên dịch để tránh sót JavaScript không còn trong src. Lỗi bootstrap được ghi ra console và process thoát với mã thất bại.

`main.ts` tạo ứng dụng từ `AppModule` và mở cổng; `AppModule` đăng ký `HealthController`; controller nhận `GET /health` và trả object để Nest chuyển thành JSON. Chưa cần service riêng.

## API phòng trong bộ nhớ

Gửi `Content-Type: application/json` với body chỉ có `{"nickname":"  Người chơi  "}`. Backend kiểm tra runtime, trim và nhận 1–30 Unicode code point; không ép kiểu hoặc nhận trường thừa.

- `POST /rooms`: HTTP 201, cấp ghế Đỏ.
- `POST /rooms/:code/join`: HTTP 200, cấp ghế Đen nếu còn trống.

Response mẫu (token đã che):

```json
{
  "roomCode": "ABC234",
  "seat": "red",
  "nickname": "Người chơi",
  "seatToken": "<token-riêng-của-ghế>"
}
```

Join có cùng cấu trúc response với `seat: "black"`. Response chứa token đặt `Cache-Control: no-store`; chỉ trả token của chính ghế được cấp, không trả object phòng nội bộ. Không log token, body hoặc response nhạy cảm. Token là bí mật của ghế; bước này chưa có endpoint dùng token để xác thực.

Mã phòng gồm 6 ký tự trong `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sinh bằng crypto; trùng thử lại tối đa 20 lần. Token dùng 32 byte ngẫu nhiên, mã hóa base64url. Mã không được tự điều khiển từ request hoặc cấu hình công khai.

Lỗi có dạng `{"statusCode":409,"code":"ROOM_FULL","message":"Phòng đã đủ hai người."}`:

| HTTP | Code | Ý nghĩa |
|---|---|---|
| 400 | INVALID_REQUEST | Body/biệt danh sai |
| 400 | INVALID_ROOM_CODE | Mã sai định dạng |
| 400 | INVALID_JSON | Lỗi cú pháp JSON đã được parser nhận diện |
| 404 | ROOM_NOT_FOUND | Phòng không tồn tại |
| 409 | ROOM_FULL | Ghế Đen đã được giữ |
| 503 | ROOM_CODE_UNAVAILABLE | Hết 20 lần thử mã |
| 500 | INTERNAL_ERROR | Lỗi bất ngờ, không trả stack hoặc chi tiết nội bộ |

Controller định tuyến HTTP; pipe xác thực body/mã; service giữ Map và thực hiện tạo/join. Join không có `await` giữa kiểm tra và ghi ghế, nên trong một process chỉ một request chiếm được ghế Đen. Chưa hỗ trợ nhiều process/server, phục hồi phiên, hết hạn/dọn phòng, chống spam hoặc giới hạn số phòng. Khởi động lại server mất toàn bộ phòng. Chưa tạo bàn cờ, endpoint xem phòng, database hoặc tích hợp frontend/rules. Socket.IO chỉ đồng bộ trạng thái công khai của phòng như phần dưới.

Chạy test backend từ gốc:

```powershell
npm.cmd run test --workspace=@xiangqi/server
```

Test dùng TypeScript/CommonJS, `node:test`, `node:assert/strict` và fetch có sẵn, không thêm dependency. Runner xóa `.test-output` trước biên dịch; output được Git bỏ qua. Test HTTP dùng cổng ngẫu nhiên và đóng app trong `finally`, gồm test hai join cạnh tranh.

## Socket.IO cho trạng thái phòng

Backend cổng 3001 có namespace `/rooms`, path `/socket.io`. Runtime dùng `@nestjs/websockets` và `@nestjs/platform-socket.io` 12.3.2, `socket.io` 4.8.4; test dùng `socket.io-client` 4.8.4.

Handshake chỉ nhận `auth: { roomCode, seatToken }`. Không đặt token trong URL/query, log hoặc event. Server xác thực token bằng dữ liệu RoomsService, tự xác định phe/biệt danh; khai thêm `seat` hoặc `nickname` bị từ chối. Không bật connection state recovery bỏ qua xác thực.

Event server:

- `room:session`: gửi riêng `{ roomCode, seat }` sau xác thực và join thành công.
- `room:state`: gửi snapshot `{ roomCode, players: { red, black } }`. Mỗi ghế là `{ nickname, side, connected }`, ghế Đen chưa giữ là `null`. Không chứa token, socket ID hoặc object phòng nội bộ.
- `room:replaced`: `{ code: "SEAT_REPLACED", message }` gửi socket cũ, sau đó server ngắt socket đó. Tab cũ không nên tự kết nối lại để tranh ghế.
- `connect_error`: lỗi handshake với `error.data = { code, message }`; code là `INVALID_HANDSHAKE`, `AUTH_FAILED` hoặc `INTERNAL_ERROR`. Phòng không tồn tại và token không khớp dùng chung lỗi xác thực.

Socket mới xác thực hợp lệ thay socket cũ. Mỗi ghế chỉ lưu một activeSocketId trong Map RoomsService; disconnect chỉ đánh offline nếu ID còn khớp. Gateway kiểm tra quyền sau các bước chờ, loại socket mất quyền khỏi room và không gửi session muộn. Socket.IO chỉ dùng registry kết nối của nó, không có Map phòng nghiệp vụ thứ hai.

Khi Đen join qua HTTP, RoomsService phát thông báo nội bộ chỉ chứa mã phòng; gateway lấy snapshot công khai và gửi cho người Đỏ online. Listener được gỡ khi app đóng. Khi mất kết nối có thể xác thực lại bằng token cũ; chưa có phục hồi phiên, replay sự kiện, thu hồi/đổi token hoặc khôi phục sau restart.

Development chỉ cho Origin `http://localhost:3000` và `http://127.0.0.1:3000`. CORS riêng Socket.IO và allowRequest chặn Origin sai/thiếu trên cả polling/WebSocket; không dùng wildcard hoặc mở CORS cho HTTP API. Test Node phải gửi Origin hợp lệ. Origin không thay thế token xác thực; chưa cấu hình cho IP LAN/cổng khác hoặc production.

Test backend hiện có chạy cả HTTP và socket: xác thực, phòng cách ly, join HTTP cập nhật online, connect/disconnect, thay socket/reconnect/cạnh tranh, payload không token và origin. Các lần chờ có timeout; test đóng client/app kể cả khi thất bại. Bước này chưa làm frontend, bàn cờ/nước đi, database, nhiều process, hết hạn/dọn phòng hoặc chống spam.

## Cấu trúc và vai trò

- `apps/web` (`@xiangqi/web`): frontend Next.js, giao diện chơi trên máy tính và điện thoại.
- `apps/server` (`@xiangqi/server`): NestJS với health và phòng hai ghế trong bộ nhớ; chưa có bàn cờ hoặc xác thực nước đi trên server.
- `packages/rules` (`@xiangqi/rules`): bộ luật TypeScript thuần, đang được frontend dùng; sẽ dùng chung với backend và backend sẽ xác thực nước đi khi triển khai chơi qua mạng.

`package.json` gốc khai báo các workspace; mỗi workspace có `package.json` riêng. Dự án dùng npm workspaces, chưa dùng Nx hoặc Turborepo.

## Dùng package rules

`@xiangqi/rules` là TypeScript thuần, không phụ thuộc React, Next.js, NestJS hoặc DOM. Package export các kiểu `Side`, `PieceType`, `Row`, `Col`, `Piece` và hàm `createInitialPieces()` qua `src/index.ts`.

Package cũng export bảy hàm trả về `boolean`: `canRookMoveByGeometry`, `canCannonMoveByGeometry`, `canHorseMoveByGeometry`, `canElephantMoveByGeometry`, `canAdvisorMoveByGeometry`, `canGeneralMoveByGeometry`, `canSoldierMoveByGeometry`. Mỗi hàm nhận `readonly Piece[]`, ID quân và điểm đến `{ row: number; col: number }`, không thay đổi dữ liệu đầu vào.

Các hàm hình học chỉ kiểm tra hình học, vật cản/ngòi/chân/mắt nếu có, vùng bàn của quân và phe tại điểm đích. Giả định danh sách quân đầu vào hợp lệ (ID/vị trí không trùng, vị trí trong bàn). Riêng các hàm hình học chưa xét lượt, chiếu, an toàn của Tướng hoặc kết thúc trận; Tướng không có nước ăn xa.

API cấp cao gồm `canPieceMoveByGeometry` (điều phối bảy quân), `isInCheck` (đe dọa hình học và hai Tướng đối mặt), `isLegalMove` (đúng phe, hình học, mô phỏng và an toàn của Tướng; cấm ăn mất Tướng), `getLegalMoves` (danh sách `LegalMove`) và `getGameStatus` (đang chơi hoặc kết thúc với bên thắng/thua và lý do). Các API kiểm tra chiếu/nước hợp lệ/trạng thái yêu cầu đúng một Tướng mỗi phe, thiếu/trùng sẽ báo lỗi. Không sửa dữ liệu đầu vào; không dùng việc ăn mất Tướng để kết thúc trận.

Chạy toàn bộ test rules từ gốc repository:

```powershell
npm.cmd run test --workspace=@xiangqi/rules
```

Runner dùng TypeScript và kiểu Node đã có trong repository, xóa `.test-output` cũ trước khi biên dịch CommonJS rồi chạy `node:test`. Output tạm được Git bỏ qua; không có framework test bổ sung.

```typescript
import { createInitialPieces } from "@xiangqi/rules";
import type { Piece } from "@xiangqi/rules";

const pieces: Piece[] = createInitialPieces();
```

Mỗi lần gọi tạo mảng 32 quân mới, gồm cả đối tượng quân và `position` mới; ID ổn định giữa các lần gọi. Không export một mảng mutable dùng chung giữa các trận.

Frontend khai báo dependency nội bộ `"@xiangqi/rules": "*"`. Khi chạy `npm.cmd install` tại gốc, npm liên kết workspace trong repository. Next.js dùng `transpilePackages` trong `apps/web/next.config.ts` để biên dịch mã TypeScript của rules, chưa cần build riêng package. Bàn local dùng state chung cho danh sách quân, lượt, ID đang chọn, nước vừa đi và thông báo; khởi tạo lười bằng dữ liệu mới. Trạng thái trận được suy ra bằng `useMemo` theo bàn/lượt, không tính lại khi chỉ chọn quân hoặc đổi focus.

Khi triển khai NestJS, cần cấu hình backend biên dịch/nạp package TypeScript này (hoặc bổ sung đầu ra JavaScript cho rules) trong nhiệm vụ riêng. Hiện chưa kiểm chứng việc dùng rules trên backend; xác thực nước đi hiện chạy tại frontend local.

## Phạm vi V1 đã thống nhất (gồm các phần chưa triển khai)

- Web chơi được trên máy tính và điện thoại.
- Người chơi nhập biệt danh, tạo phòng hoặc vào phòng bằng mã.
- Mỗi trận có hai người chơi; chưa có bot, xếp hạng hoặc đồng hồ.
- Chưa có tài khoản hoặc database.
- Không có tiền, cửa hàng, nâng cấp hoặc nạp tiền trong V1.
- Server lưu trạng thái phòng và trận trong bộ nhớ; khởi động lại server sẽ mất phòng và trận đang lưu.
- Bàn cờ dùng ký hiệu trước; nhân vật 2D sẽ được bổ sung sau.
- Bản thử chưa hỗ trợ luật lặp thế, chiếu dai/đuổi dai.

## Kiểm tra kết thúc trận trong development (tạm thời)

Chạy `npm.cmd run dev:web`, mở `/dev/endgame/checkmate` hoặc `/dev/endgame/stalemate` trên địa chỉ server được terminal thông báo. Hai trang dùng fixture đã kiểm tra trong rules, đều có Đen đến lượt và Đỏ thắng. Route sai hoặc môi trường production trả 404. Trang `/` vẫn khởi tạo khai cuộc bình thường.

Kiểm tra thông báo lý do thắng, bấm/Enter/Space không làm đổi trận đã kết thúc, Tab và mũi tên vẫn xem được bàn. Bấm “Ván mới” phải trở về 32 quân khai cuộc, Đỏ đi trước, không hỏi xác nhận và focus về nút; fixture không tự nạp lại sau reset. Thử thêm ở chiều rộng 375px. Tải lại trang fixture để nạp lại thế kiểm tra.

Để loại bỏ hỗ trợ này: xóa `apps/web/src/dev/endgame-fixtures.ts` và `apps/web/src/app/dev/endgame/[scenario]/page.tsx`; bỏ interface/prop `initialGame` và phần sao chép prop trong `XiangqiBoard.tsx`, trả initializer về `useState(createLocalGame)`. Không sửa rules hoặc nút “Ván mới”.

## Kiểm tra workspace

Trên máy Windows hiện tại, dùng `npm.cmd` để tránh lỗi PowerShell chặn `npm.ps1`.

Chạy lệnh chỉ đọc sau tại thư mục gốc để xem tên các workspace:

```powershell
npm.cmd pkg get name --workspaces
```

Lệnh này chỉ kiểm tra khai báo workspace, không cài package và không chạy ứng dụng.
