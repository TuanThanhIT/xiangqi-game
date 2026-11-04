# Web cờ tướng

Dự án web cờ tướng để vừa học lập trình vừa triển khai thực tế, tổ chức trong một repository bằng npm workspaces.

## Trạng thái hiện tại

Frontend Next.js dùng TypeScript, App Router, thư mục `src`, ESLint và CSS thông thường. Hai người có thể chơi luân phiên trên cùng thiết bị, Đỏ đi trước: chọn/bỏ chọn, đi/ăn quân theo luật đã hỗ trợ, xem nước vừa đi và cảnh báo chiếu. Bàn SVG co giãn cho điện thoại, hỗ trợ chuột/chạm và bàn phím (Tab vào bàn, mũi tên chuyển giao điểm, Enter/Space xác nhận).

Trận kết thúc khi bên đến lượt hết nước hợp lệ: bị chiếu là chiếu bí, không bị chiếu vẫn thua vì hết nước (không hòa như cờ vua). Sau kết thúc không thể chọn/đi quân, vẫn điều hướng bàn phím được. Nút “Ván mới” tạo lại khai cuộc; hỏi xác nhận nếu đã đi và trận chưa kết thúc, hủy sẽ giữ nguyên trận.

Trang `/` là menu chính nền tối với điểm nhấn đỏ son/vàng đồng. Bàn local nằm tại `/local`: trạng thái chỉ nằm trong bộ nhớ trình duyệt, tải lại hoặc rời trang sẽ mất ván. Chơi qua mạng nằm riêng tại `/play`; server giữ bàn trong bộ nhớ và có thể tiếp tục sau reconnect bằng phiên ghế còn hợp lệ.

### Năm phong cách phòng miễn phí

Màn hình trận đã có header/sidebar gọn, kích thước bàn theo chiều cao viewport
và hình quân 2.5D nhẹ. Selected nâng/phóng quanh tâm; focus và lastMove là dấu
tròn riêng. Xem [số đo, ảnh trước/sau và giới hạn kiểm chứng](docs/design/COMPACT.md).

Người tạo chọn Đất cát, Thảo nguyên, Thủy mặc, Trúc lâm hoặc Tuyết sơn trên form
tạo phòng. Người vào phòng không chọn lại: server giữ `themeId`, gửi qua
`room:state`; reconnect/reload tiếp tục cùng phong cách. Phiên lưu không chứa
theme. Trước snapshot phòng hợp lệ, giao diện trung tính và chưa mở thao tác bàn.
Menu giữ nhận diện chung, `/local` mặc định Đất cát, không có bộ chọn.

`POST /rooms` nhận `{ "nickname": "Người chơi", "themeId": "bamboo" }`;
thiếu `themeId` dùng `earth`. Join chỉ nhận nickname, không chấp nhận ghi đè theme.
Chỉ năm ID cố định; không nhận URL/path/CSS. Theme không thuộc `game:state`,
không đổi revision, token, luật hoặc quyền ghế. Cần chạy lại cả web/backend
với hợp đồng mới. Không thêm dependency cho chức năng này.

Ảnh phong cảnh/texture WebP đặt trong `apps/web/public/themes`; khung, sông/sóng
tĩnh và lưới là SVG/CSS. Quân Đen/Đỏ đều viền kép liền; chữ Hán và tên truy cập
tiếng Việt được giữ. Xem [quy chuẩn, screenshot và giới hạn nghiệm thu](THEMES.md)
và [nguồn asset](apps/web/public/themes/README.md).

### Menu và điều hướng sau trận

- `/`: menu có Tạo phòng (`/play?mode=create`), Vào phòng (`/play?mode=join`), Chơi cùng thiết bị (`/local`) và Tiếp tục phòng khi đọc được phiên lưu hợp lệ.
- Menu chỉ đọc/validate storage sau mount, không tạo socket hoặc gửi POST. Tiếp tục phòng mở `/play`; bấm xác nhận tiếp tục tại đây để backend xác thực và nhận snapshot mới nhất. Phiên hợp lệ ở storage chưa bảo đảm token vẫn được server chấp nhận.
- Nếu đang giữ phiên cũ, cả lối Tạo phòng và Vào phòng đều ưu tiên màn hình phiên đã lưu. Tạo phòng mới vẫn phải qua xác nhận và luồng đồng bộ/đầu hàng ván cũ; không ghi đè token hoặc tự tạo phòng. Hủy xác nhận giữ nguyên phiên.
- Kết quả online (chiếu bí, hết nước, đầu hàng, timeout hoặc hủy) có hai nút ngay dưới thông báo. Về menu dọn socket/listener/timer, xóa đúng credentials cũ rồi dùng Next.js router về `/`, không reload. Tạo phòng mới dọn tương tự rồi mở riêng form tạo phòng, không gửi đầu hàng lại hoặc POST tự động. Bàn kết thúc vẫn xem được bằng bàn phím trước khi rời.
- Khi chưa kết thúc không có nút Về menu mới trong bàn online. Lỗi đồng bộ/mất quyền giữ cơ chế phục hồi hiện có. Nếu tab khác đã lưu phiên mới, cleanup không xóa phiên đó; khi mở form vẫn ưu tiên màn hình tiếp tục của phiên mới. Storage bị chặn sẽ báo lỗi thay vì giả vờ đã xóa.
- Đánh với máy, tài khoản/hồ sơ, bảng xếp hạng, bộ sưu tập nhân vật và cửa hàng/phần thưởng chỉ là nhãn khóa/sắp ra mắt, chưa có tính năng, giá, số dư hoặc hành động. Chưa thêm nhân vật, skin hay hoạt ảnh chiến đấu.

Socket và state phiên hoạt động vẫn thuộc `useRoomSession` trong `/play`, không có provider phiên dùng chung giữa route. Menu không import hook socket. Chuyển route sẽ unmount và cleanup; không tự nối lại từ menu. Các trang development local vẫn dùng bàn local như trước.

Backend NestJS có `GET /health`, API tạo/vào phòng trong bộ nhớ và Socket.IO xác thực ghế/trạng thái kết nối tại cổng 3001. Có allowlist origin riêng cho Socket.IO; chưa bật CORS cho HTTP API, chưa có database. Backend quản lý một trận mỗi phòng và xác thực nước đi bằng rules qua Socket.IO; frontend `/play` hiển thị bàn online theo snapshot server. Workspace rules đã có kiểu dữ liệu, thế khai cuộc, hình học bảy quân, kiểm tra chiếu và an toàn của Tướng, xác thực nước đi, liệt kê nước hợp lệ và xác định kết thúc trận. Đây là luật đã hỗ trợ cho bản thử, chưa phải toàn bộ luật thi đấu: chưa hỗ trợ hòa thỏa thuận, lặp thế, chiếu dai/đuổi dai.

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
npm.cmd run build:web
```

Lệnh `dev:web` ở gốc build rules trước, rồi gọi script `dev` của workspace `@xiangqi/web`, chạy `next dev`. App Router dùng `apps/web/src/app/layout.tsx` làm khung trang và `apps/web/src/app/page.tsx` làm nội dung trang chủ. File `globals.css` chứa CSS chung; alias `@/*` trỏ tới `apps/web/src/*`.

## Phòng chờ tại /play

Trang `/play` cho nhập biệt danh để tạo phòng hoặc nhập thêm mã để vào phòng; query `mode=create`/`mode=join` chỉ chọn form, không mang credentials hoặc tự gửi request. HTTP đi qua hai Route Handler cố định của Next.js (`/api/rooms`, `/api/rooms/[code]/join`), Socket.IO kết nối trực tiếp backend namespace `/rooms`. Bàn local tại `/local` và các trang kiểm tra kết thúc local giữ nguyên logic chơi.

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

Frontend phải chạy tại `http://localhost:3000` hoặc `http://127.0.0.1:3000` theo allowlist socket hiện tại. Thử hai người bằng hai profile khác nhau (ví dụ cửa sổ thường và ẩn danh): A tạo phòng, sao chép mã; B nhập mã và biệt danh để vào. Hai tab cùng profile/origin dùng chung một phiên, phù hợp để thử tiếp tục/thay ghế. Chưa có trận thì hiện phòng chờ; khi người thứ hai giữ ghế và nhận snapshot, hiện bàn online, Đỏ đi trước. Ghế offline vẫn được giữ, không trở thành ghế trống.

Phiên gần nhất lưu trong `localStorage`, dùng chung cho mỗi browser profile/origin, được kiểm tra runtime sau khi component mount. Khi mở/reload `/play`, nếu có phiên hợp lệ hiện mã phòng, biệt danh, phe đã lưu và hai nút “Tiếp tục phòng”, “Tạo phòng mới”; chưa tạo socket hoặc POST tạo/join. Bấm tiếp tục mới xác thực ghế và nhận snapshot hiện tại trước khi tương tác. Sau tạo/join mới thành công vẫn lưu phiên và kết nối ngay. Mất mạng trong tab đang chơi vẫn tự reconnect, không cần bấm tiếp tục mỗi lần.

“Tạo phòng mới” hỏi: “Nếu ván cũ còn diễn ra, bạn sẽ đầu hàng để tạo phòng mới.” Hủy không kết nối/gửi request hoặc đổi phiên. Đồng ý sẽ kết nối tạm phiên cũ, không cho đi quân, chờ xác thực và snapshot mới. Nếu còn chơi, gửi đầu hàng qua pending/retry hiện có (không cần đúng lượt/đối thủ online); chỉ bỏ phiên khi nhận snapshot kết thúc hợp lệ, kể cả chiếu bí/hết nước xảy ra trong lúc xử lý. Ack một mình không đủ. Phòng chưa có trận hoặc trận đã kết thúc thì bỏ phiên ngay sau đồng bộ. Sau đó chỉ mở form, không POST tạo phòng tự động. Không xóa phòng/giải phóng ghế trên server.

AUTH_FAILED chỉ xóa credentials khớp và về form, không kết luận phòng không tồn tại. Lỗi mạng, timeout request, payload sai hoặc hết retry giữ token để tải lại/phục hồi, không khởi động thêm luồng chồng lên. Khi rời phiên đã xử lý xong, dọn timer/listener và ngắt socket; nếu tab khác đã lưu phiên mới thì giữ nguyên phiên đó và hiện màn hình tiếp tục của nó. Chỉ có nút rời trực tiếp sau kết thúc/hủy, chưa có khi trận còn chơi. Trận bị hủy cũng được coi là đã kết thúc khi mở form mới, không gửi đầu hàng.

Phiên sessionStorage cũ được chuyển sang localStorage khi không có phiên local hợp lệ; chỉ xóa bản cũ sau khi ghi thành công. Nếu hai nơi khác phiên, ưu tiên localStorage hợp lệ, không ghi đè nó. Nếu storage bị chặn, có cảnh báo không bảo đảm khôi phục sau đóng tab; bản cũ chưa migrate được vẫn được giữ. JavaScript cùng origin đọc được token, nên localStorage không phải kho bí mật chống XSS; localhost và 127.0.0.1 là hai origin khác nhau.

Mở tab mới chưa thay tab đang chơi; chỉ sau khi bấm “Tiếp tục phòng” và backend xác thực thì socket mới thay socket cũ. `room:replaced` dừng tab cũ nhưng giữ phiên dùng chung, không tự giành lại ghế. Không kết nối hoặc cập nhật phiên tự động qua storage event; khi bấm tiếp tục sẽ đọc lại storage, nếu credentials đã đổi thì hiện thông tin mới để người dùng duyệt bằng lần bấm tiếp theo. `AUTH_FAILED` chỉ xóa phiên khớp roomCode/token đã bị từ chối, không xóa phiên mới của tab khác. Callback cũ bị chặn; lỗi mạng/timeout không xóa phiên. Nếu xóa credentials bị chặn sẽ báo cần xóa dữ liệu trang. Server restart vẫn làm mất phòng/trận và vô hiệu token đã lưu.

POST chỉ chạy từ submit, có khóa chống gửi trùng và timeout: 8 giây proxy, 12 giây browser. Không tự retry: timeout/mất response có thể xảy ra sau khi backend đã giữ ghế, và hiện chưa có cơ chế lấy lại token bị mất. Proxy chỉ gửi JSON nickname và Content-Type, không chuyển cookie/header browser; response no-store. Socket đăng ký listener trước connect, cleanup khi unmount, xác nhận phe sau `room:session` và loại callback của socket cũ. Thông tin snapshot lúc mất kết nối là dữ liệu lần gần nhất.

Thử thủ công: nickname/mã sai, người thứ ba nhận ROOM_FULL, đóng/mở hoặc reload chỉ hiện tiếp tục mà không tự kết nối/POST, bấm tiếp tục nhận lại đúng bàn/lượt/kết quả, mở tab mới chưa thay tab cũ đến khi bấm tiếp tục, tab bị thay không xóa phiên chung, mất mạng tự reconnect, backend restart, clipboard/storage bị chặn, phím Tab/Enter và chiều rộng 375px. Không dán token vào URL, console hoặc ảnh chụp công khai.

### Bàn online và phục hồi nước đang chờ

`BoardView` dùng chung phần SVG, vùng tương tác và focus bàn phím cho local/online. Local giữ logic và nút “Ván mới” riêng; online không có nút này. Bàn, lượt, nước vừa đi, chiếu và kết quả online lấy từ `game:state`; không cập nhật bàn trước khi server trả snapshot. Chỉ chọn quân mình khi đúng lượt, cả hai online, socket đã xác thực/đồng bộ và không có request chờ. Khi bị khóa vẫn dùng phím mũi tên để xem bàn. Nút “Đầu hàng” chỉ có ở online, hỏi xác nhận bằng window.confirm; hủy không gửi hoặc đổi trận. Được đầu hàng ngoài lượt hoặc khi đối thủ offline, nhưng bản thân phải đang kết nối, xác thực, đồng bộ và trận còn chơi.

Move và resign dùng chung khóa pending: không gửi hành động mới khi hành động trước đang chờ hoặc chưa rõ kết quả. Mỗi ý định đi quân giữ cố định UUID v4, revision và đích; đầu hàng chỉ gửi `{ requestId }`, không gửi expectedRevision. Timeout ack 5 giây, tối đa 3 lần gửi tổng cộng; retry không sửa ID, loại hành động hoặc payload. Không emit khi disconnected và dùng volatile emit để không để Socket.IO buffer hành động ngoài luồng retry này. Reconnect phải xác thực và nhận snapshot trước khi thử lại request cũ. Ack thành công chỉ hoàn thành khi đã có snapshot đạt revision tương ứng; snapshot một mình không xác nhận request thành công. Ack move phải tăng một revision so với yêu cầu, còn ack resign có thể tăng nhiều hơn so với snapshot client trước đó nếu có nước đi khác được server xử lý trước.

Cùng revision vẫn nhận `playEnabled`, `serverNow` và `deadlines` mới. Nội dung trận được so sánh theo giá trị và ID quân, không theo tham chiếu/thứ tự key; revision lùi hoặc cùng revision khác bàn/kết quả được coi là lỗi đồng bộ, khóa tương tác và yêu cầu tải lại. Snapshot cũ vẫn được đối chiếu sau reconnect.

Hết retry hiện “Chưa xác định được kết quả nước đi” hoặc “Chưa xác định được kết quả đầu hàng”, giữ khóa và nút “Tải lại trang”; không suy đoán thành công từ lastMove. Ack từ chối cần revision mới hơn sẽ chờ đồng bộ tối đa 5 giây, sau đó cũng khóa và hướng dẫn tải lại. `STALE_REVISION` sau retry không chứng minh lần gửi đầu đã thất bại. Pending chỉ giữ trong bộ nhớ: tải lại bỏ pending, hiện phiên localStorage để bấm “Tiếp tục phòng” rồi nhận bàn hiện tại, không POST tạo/join hoặc tự gửi lại hành động cũ. Nếu storage không ghi được phiên thì tải lại có thể mất credentials như giới hạn đã nêu.

Kiểm tra frontend bằng công cụ hiện có, không thêm framework:

```powershell
npm.cmd run build:rules
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build:web
```

Test dùng `node:test`, compiler TypeScript đã có để nạp source trong bộ nhớ, đồng hồ/socket/hook giả và render HTML bằng React hiện có. Chúng kiểm tra validator, ack/snapshot, retry, reconnect, callback cũ, thay ghế, bàn phím ở mức handler và local/reset/fixture; không thay thế kiểm thử tương tác trong trình duyệt.

## Chạy và kiểm tra backend

Backend dùng NestJS 12.3.2, CommonJS, được tạo thủ công; không cần Nest CLI. Node.js 22.17.0 hiện tại đáp ứng yêu cầu runtime. Cài dependency từ gốc bằng `npm.cmd install`, giữ duy nhất `package-lock.json` ở gốc.

Từ thư mục gốc, chạy:

```powershell
npm.cmd run typecheck:server
npm.cmd run build:server
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

Controller định tuyến HTTP; pipe xác thực body/mã; service giữ Map và thực hiện tạo/join. Join không có `await` giữa kiểm tra và ghi ghế, nên trong một process chỉ một request chiếm được ghế Đen. Ghế Đen và trận khai cuộc được chuẩn bị rồi ghi cùng nhau; lỗi khởi tạo không giữ lại ghế Đen. Chưa hỗ trợ nhiều process/server, hết hạn/dọn phòng, chống spam hoặc giới hạn số phòng. Khởi động lại server mất toàn bộ phòng, trận, token và cache request. Chưa có endpoint xem phòng hoặc database. Socket.IO đồng bộ phòng và trận như phần dưới.

Chạy test backend từ gốc:

```powershell
npm.cmd run test:server
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

Test backend hiện có chạy cả HTTP và socket: xác thực, phòng cách ly, join HTTP cập nhật online, connect/disconnect, thay socket/reconnect/cạnh tranh, payload không token và origin. Các lần chờ có timeout; test đóng client/app kể cả khi thất bại. Chưa làm bàn online trên frontend, database, nhiều process, hết hạn/dọn phòng hoặc chống spam.

## Trận online ở backend

RoomsService vẫn giữ Map phòng duy nhất. Mỗi phòng có `game: null` khi chỉ có Đỏ; khi Đen giữ ghế thành công, server tạo 32 quân mới, Đỏ đi trước, `revision: 0`. Trận gồm `pieces`, `sideToMove`, `lastMove` (`{ pieceId, from, to }` hoặc `null`), `revision` và `result` theo `OnlineGameResult` của backend: `GameStatus` từ rules, kết quả đầu hàng `resignation`, mất kết nối quá hạn `disconnect_timeout` hoặc hủy `cancelled`.

Server phát event riêng `game:state` với `{ roomCode, game, playEnabled, serverNow, deadlines: { red, black } }`, không thay đổi hợp đồng `room:state`. serverNow/deadline dùng Unix milliseconds; deadline không có là null. Snapshot là bản sao công khai, không có token, socket ID, timer hoặc cache. `playEnabled` chỉ đúng khi trận còn chơi và hai socket hiện hành đã attach xong; nó không thay thế kiểm tra lượt. Connect/reconnect nhận `room:session` và trạng thái hiện tại. Offline khóa đi quân và có thời hạn 60 giây theo phần dưới.

### Mất kết nối quá hạn 60 giây

Chỉ trận đã bắt đầu và còn chơi mới áp dụng. Server ghi deadline riêng của mỗi ghế offline bằng now + 60.000ms (kể cả ghế chưa online lúc trận được tạo). Phòng chỉ có một người, chưa có trận thì không có deadline. Trở lại trước hạn xóa deadline; now >= deadline là quá hạn. Người trở lại muộn vẫn xem được trạng thái nhưng dấu quá hạn được giữ nguyên trong trận đó.

Một ghế quá hạn và ghế kia online: bên quá hạn thua, kết quả `{ status: "finished", winner, loser, reason: "disconnect_timeout" }`. Nếu cả hai offline thì giữ hai deadline, chưa xử thắng. Khi cả hai deadline đều hết: `{ status: "cancelled", reason: "both_disconnected" }`, không có winner/loser, kể cả một người đã quay lại muộn. Ví dụ Đỏ hết hạn 60s, Đen 70s: Đỏ quay lại 65s không được đi quân; Đen quay lại trước 70s thì Đen thắng, nếu không thì hủy ở 70s.

RoomsService đánh giá trạng thái cũ trước reconnect/move/resign; sau cập nhật kết nối lại đánh giá lần nữa. Không xóa deadline đã hết để cứu trận. Thay tab chỉ thay socket hiện hành, không tạo offline giả. Callback timer kiểm tra phòng/version hiện tại; deadline đã hết không bị đặt timer lặp liên tục. Timer được dọn khi kết thúc/hủy hoặc app đóng. Clock/scheduler có thể thay trong test nội bộ, không có endpoint hoặc tham số công khai điều khiển thời gian.

Kết thúc/hủy tăng revision đúng một lần, giữ pieces/sideToMove/lastMove. Online/offline và cập nhật deadline không tăng revision. Trận đã kết thúc/hủy không bị ghi đè, kể cả callback muộn. Retry move/resign đã thành công vẫn nhận ack cũ từ cache sau timeout; hành động mới nhận GAME_FINISHED.

Frontend dùng serverNow và thời điểm nhận snapshot để hiển thị thời gian còn lại gần đúng; reconnect nhận deadline hiện tại, không đếm lại 60 giây. Đồng hồ về 0 chỉ báo đang chờ server xác nhận; không tự xử thắng/thua/hủy. Kết quả timeout hiển thị thắng do đối thủ mất kết nối quá thời hạn; cancelled hiển thị “Trận đã hủy vì cả hai người chơi mất kết nối quá thời hạn”, không có người thắng. Mọi kết quả kết thúc/hủy khóa đi quân/đầu hàng nhưng vẫn xem bàn bằng bàn phím. “Tiếp tục phòng” xem được kết quả; “Tạo phòng mới” bỏ trận hủy sau đồng bộ, không đầu hàng.

Test dùng clock/scheduler giả, không chờ thật 60 giây: trước/đúng/sau hạn, hai thời hạn lệch nhau, người quay lại muộn, hủy trước reconnect, timer trễ/cũ, thay tab, cạnh tranh nước cuối/đầu hàng, idempotency và cleanup. Socket test kiểm tra phát deadline/kết quả tới đối thủ và reconnect xem lại. Đây không phải đồng hồ lượt; chưa có database, chơi lại hoặc cơ chế xử lý qua nhiều process. Restart server vẫn mất phòng/trận.

Client gửi `game:move` kèm callback acknowledgement, không gửi phe, phòng hoặc bàn cờ:

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "expectedRevision": 0,
  "pieceId": "red-soldier-0",
  "to": { "row": 5, "col": 0 }
}
```

Validation runtime chỉ nhận đúng bốn trường trên: UUID v4 (chuẩn hóa chữ thường), revision nguyên an toàn không âm, ID dài 1–64 ký tự chữ/số/`_`/`-`, đích nguyên trong hàng 0–9/cột 0–8. Trường thừa hoặc sai kiểu bị từ chối. Server lấy phòng/phe từ socket đã xác thực và kiểm tra `activeSocketId` cùng trạng thái attach trước tra cache.

Ack thành công:

```json
{ "ok": true, "requestId": "550e8400-e29b-41d4-a716-446655440000", "appliedRevision": 1 }
```

Ack thất bại, ví dụ bàn đã cũ:

```json
{ "ok": false, "requestId": "550e8400-e29b-41d4-a716-446655440000", "code": "STALE_REVISION", "message": "Bàn cờ đã thay đổi.", "currentRevision": 1 }
```

`requestId` là `null` khi payload không hợp lệ hoặc socket không còn quyền/chưa attach; `currentRevision` có khi server biết revision trong bước xử lý. Các mã lỗi: `INVALID_MOVE_REQUEST`, `SOCKET_NOT_ACTIVE`, `GAME_NOT_STARTED`, `PLAYERS_OFFLINE`, `GAME_FINISHED`, `STALE_REVISION`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `REQUEST_ID_CONFLICT`, `INTERNAL_ERROR`. Thông báo cố định không phản chiếu dữ liệu bí mật hoặc stack.

Mỗi ghế giữ tối đa 256 hành động mới đúng định dạng gần nhất, dùng chung cho move/resign, gồm loại hành động, payload chuẩn hóa và ack (cả thành công và bị từ chối); request không hợp lệ hoặc socket không có quyền không được lưu. Cache không bị mất khi thay socket/reconnect. Cùng ID/cùng loại/cùng payload trả lại ack cũ trước kiểm tra lượt/revision/kết thúc, không đi lại hoặc phát snapshot lại. Cùng ID nhưng khác loại hoặc payload trả `REQUEST_ID_CONFLICT`, không ghi đè entry cũ. Một yêu cầu mới phải dùng ID mới; retry giữ nguyên cả ID và payload. Sau eviction, nước từng thành công vẫn không thể áp dụng lại do expectedRevision đã cũ. Ack cũ có thể chứa revision cũ; snapshot hiện tại mới là bàn đang chơi.

Không có `await` giữa kiểm tra và ghi trạng thái. Server gọi `isLegalMove`, tạo bàn mới/loại quân bị ăn, đổi lượt, ghi lastMove và tính `getGameStatus` trước khi commit trạng thái, tăng revision đúng một lần và phát snapshot. Không cho ăn Tướng; chiếu bí và hết nước đều là thua cho phe đến lượt. Lỗi tính toán trả `INTERNAL_ERROR` và giữ nguyên bàn. Request cạnh tranh cùng revision tối đa một nước thành công trong một process.

Frontend `/play` gửi `game:move`, `game:resign` và hiển thị `game:state` theo quy trình pending/snapshot ở trên. Kết quả đầu hàng hiển thị “Đỏ/Đen thắng do đối thủ đầu hàng”; sau kết thúc khóa cả đi quân và đầu hàng. Chưa có chơi lại online, hòa, đồng hồ, lặp thế, chiếu dai/đuổi dai, lưu bền hoặc cơ chế bảo đảm giao sự kiện sau restart.

### Đầu hàng online — backend

Event `game:resign` nhận đúng một trường UUID v4, chuẩn hóa chữ thường; không nhận `expectedRevision`, phe hoặc mã phòng:

```json
{ "requestId": "550e8400-e29b-41d4-a716-446655440000" }
```

Chỉ socket hiện hành đã xác thực và attach được yêu cầu đầu hàng; kiểm tra quyền trước tra cache. Trận phải đã bắt đầu và còn chơi. Được đầu hàng ngoài lượt, khi đang bị chiếu hoặc khi đối thủ offline. Không phụ thuộc thế cờ nên không cần expectedRevision. Server giữ nguyên pieces, sideToMove và lastMove; chỉ ghi kết quả `{ status: "finished", winner, loser, reason: "resignation" }` và tăng revision một lần. Đầu hàng trước nước đầu có revision 1 nhưng lastMove vẫn null. Snapshot phát tới phòng có `playEnabled: false`; reconnect/online/offline không tính lại kết quả bằng getGameStatus.

Ack thành công có `{ "ok": true, "requestId": "<UUID-v4>", "appliedRevision": 1 }`. Ack lỗi có `{ "ok": false, "requestId": "<UUID-v4-hoặc-null>", "code": "GAME_FINISHED", "message": "Trận đã kết thúc.", "currentRevision": 1 }`; currentRevision chỉ có khi biết revision, requestId null khi socket không đủ quyền hoặc payload sai. Các mã: `INVALID_RESIGN_REQUEST`, `SOCKET_NOT_ACTIVE`, `GAME_NOT_STARTED`, `GAME_FINISHED`, `REQUEST_ID_CONFLICT`, `INTERNAL_ERROR`. Lỗi bất ngờ không lộ chi tiết nội bộ hoặc ghi một phần trạng thái.

Cache 256 hành động mỗi ghế phân biệt `kind: "move" | "resign"`. Retry đầu hàng cùng ID còn trong cache trả ack cũ, không tăng revision hoặc phát snapshot lại; cùng ID dùng giữa move/resign bị xung đột theo cả hai chiều. Sau eviction, retry đầu hàng nhận GAME_FINISHED vì trận đã kết thúc, không áp dụng lần hai; không còn đảm bảo trả lại ack thành công ban đầu. Giới hạn này dựa trên việc chưa có chơi lại trong cùng phòng.

Service xử lý đồng bộ, không await giữa kiểm tra và ghi. Nếu đầu hàng được xử lý trước, nước đi mới bị GAME_FINISHED. Nếu nước đi hợp lệ được xử lý trước và trận còn chơi, đầu hàng áp dụng sau và tăng thêm một revision; nếu nước đi đã chiếu bí/hết nước thì đầu hàng bị từ chối. Hai người đầu hàng cạnh tranh: chỉ người có yêu cầu được server xử lý trước thua, người còn lại thắng. Retry nước đi cũ đã thành công vẫn được trả ack từ cache sau kết thúc.

Frontend đã hỗ trợ snapshot resignation và nút đầu hàng riêng cho online. Validator cho phép loser khác sideToMove, revision dương với lastMove null khi resignation, đồng thời vẫn kiểm tra winner/loser khác nhau, playEnabled false và snapshot cùng revision phải nhất quán theo nội dung. Giao diện hiển thị lý do đầu hàng riêng. Không sửa getGameStatus hoặc luật trong package rules cho sự kiện này.

Test backend bao phủ cả hai phe, ngoài lượt/offline, validation, giữ bàn/lượt/lastMove, retry/reconnect, socket cũ/chưa attach, cache chung/eviction/xung đột, cạnh tranh move/resign/hai bên đầu hàng, cách ly phòng và snapshot không chứa bí mật. Test socket có timeout và dọn app/client trong finally. Test frontend bổ sung hủy xác nhận, khóa chung move/resign, ack/snapshot, timeout/reconnect, đồng hồ hiển thị và trận hủy. Chưa có chơi lại hoặc database.

## Cấu trúc và vai trò

- `apps/web` (`@xiangqi/web`): frontend Next.js, giao diện chơi trên máy tính và điện thoại.
- `apps/server` (`@xiangqi/server`): NestJS với health, phòng hai ghế và trận trong bộ nhớ; xác thực nước đi qua Socket.IO bằng rules.
- `packages/rules` (`@xiangqi/rules`): bộ luật TypeScript thuần dùng chung; frontend local dùng để chơi trên thiết bị, backend dùng để xác thực nước đi online.

`package.json` gốc khai báo các workspace; mỗi workspace có `package.json` riêng. Dự án dùng npm workspaces, chưa dùng Nx hoặc Turborepo.

## Dùng package rules

`@xiangqi/rules` là TypeScript thuần, không phụ thuộc React, Next.js, NestJS hoặc DOM. Mã nguồn API nằm tại `src/index.ts`; package export JavaScript CommonJS tại `dist/index.js` và kiểu declaration tại `dist/index.d.ts`. Có các kiểu `Side`, `PieceType`, `Row`, `Col`, `Piece` và hàm `createInitialPieces()`.

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

Frontend và backend khai báo dependency nội bộ `"@xiangqi/rules": "*"`. Khi chạy `npm.cmd install` tại gốc, npm liên kết workspace trong repository. Hai ứng dụng giữ cách import qua tên package. Next.js giữ cấu hình `transpilePackages` hiện có và sử dụng đầu ra rules đã build. Bàn local dùng state chung cho danh sách quân, lượt, ID đang chọn, nước vừa đi và thông báo; khởi tạo lười bằng dữ liệu mới. Trạng thái trận được suy ra bằng `useMemo` theo bàn/lượt, không tính lại khi chỉ chọn quân hoặc đổi focus.

Build rules xóa `packages/rules/dist` cũ trước, chỉ biên dịch `src` thành JavaScript CommonJS và declaration, không đưa test vào package. Output build/test được Git bỏ qua. Backend dùng rules để xác thực nước đi và kết quả trận; frontend local cũng dùng cùng package, còn bàn online hiển thị dữ liệu backend.

### Quy trình từ bản clone chưa có dist

Chạy tại gốc repository (có thể dùng `npm.cmd ci` thay `install` khi cài theo lockfile):

```powershell
npm.cmd ci
npm.cmd run test --workspace=@xiangqi/rules
npm.cmd run test:server
npm.cmd run typecheck:server
npm.cmd run build:server
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run build:web
```

Các script gốc `dev:web`, `dev:server`, `test:server`, `typecheck:server`, `build:server`, `build:web` đều build rules trước khi chạy công việc tương ứng, nên không cần dist từ lần trước. Lệnh workspace trực tiếp của web/server không tự chuẩn bị rules; hãy dùng các script gốc trên hoặc chạy `npm.cmd run build:rules` trước. Test rules tự biên dịch mã nguồn riêng, không cần dist.

Khi sửa rules, chạy `npm.cmd run build:rules` rồi **dừng và khởi động lại backend** bằng `npm.cmd run dev:server`; nodemon hiện chỉ theo dõi `apps/server/src`. Khởi động lại frontend bằng `npm.cmd run dev:web` để nạp bản rules mới. Chưa có tiến trình watch rules tự động.

Production build theo thứ tự rules → server/web bằng các lệnh trên; chạy `npm.cmd run start --workspace=@xiangqi/server` và `npm.cmd run start --workspace=@xiangqi/web` ở hai terminal riêng. Khi triển khai phải giữ `packages/rules/dist`, package metadata và liên kết npm workspace trong repository, không chỉ sao chép riêng `apps/server/dist`. Node chạy JavaScript CommonJS của rules; không cần ts-node ở production.

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

Chạy `npm.cmd run dev:web`, mở `/dev/endgame/checkmate` hoặc `/dev/endgame/stalemate` trên địa chỉ server được terminal thông báo. Hai trang dùng fixture đã kiểm tra trong rules, đều có Đen đến lượt và Đỏ thắng. Route sai hoặc môi trường production trả 404. Trang `/` là menu; `/local` vẫn khởi tạo khai cuộc bình thường.

Kiểm tra thông báo lý do thắng, bấm/Enter/Space không làm đổi trận đã kết thúc, Tab và mũi tên vẫn xem được bàn. Bấm “Ván mới” phải trở về 32 quân khai cuộc, Đỏ đi trước, không hỏi xác nhận và focus về nút; fixture không tự nạp lại sau reset. Thử thêm ở chiều rộng 375px. Tải lại trang fixture để nạp lại thế kiểm tra.

Để loại bỏ hỗ trợ này: xóa `apps/web/src/dev/endgame-fixtures.ts` và `apps/web/src/app/dev/endgame/[scenario]/page.tsx`; bỏ interface/prop `initialGame` và phần sao chép prop trong `XiangqiBoard.tsx`, trả initializer về `useState(createLocalGame)`. Không sửa rules hoặc nút “Ván mới”.

## Kiểm tra workspace

Trên máy Windows hiện tại, dùng `npm.cmd` để tránh lỗi PowerShell chặn `npm.ps1`.

Chạy lệnh chỉ đọc sau tại thư mục gốc để xem tên các workspace:

```powershell
npm.cmd pkg get name --workspaces
```

Lệnh này chỉ kiểm tra khai báo workspace, không cài package và không chạy ứng dụng.
