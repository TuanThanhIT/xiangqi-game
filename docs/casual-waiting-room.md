# Phòng chờ Giải trí online

Nghiệm thu ngày 06/11/2026. Phạm vi từ Sảnh → tạo/vào bằng mã → phòng chờ → bàn cờ V1. Không thêm dependency, bảng/cột hoặc migration.

## Hành vi

- Sảnh mở `/play?mode=create&casual=1` hoặc `/play?mode=join&casual=1`. Phải khôi phục phiên đăng nhập trước khi mở form. Biệt danh trên form chỉ đọc; server lấy biệt danh/avatar từ tài khoản đã xác thực.
- Chủ phòng là Đỏ, khách là Đen. Một tài khoản chỉ giữ một ghế trong một phòng Giải trí chưa kết thúc. Năm theme V1 được chọn khi tạo và cố định cho cả hai người.
- Có mã phòng, sao chép, avatar dự phòng, tên thật, phe, trạng thái online và sẵn sàng. Mỗi bên bật/bỏ sẵn sàng. Server tạo trận khi cả hai online và sẵn sàng; đoạn kiểm tra/ghi trạng thái không có await nên nguyên tử trong tiến trình Node hiện tại. Không tạo lại trận khi có request đến muộn.
- Chủ rời phòng chờ: xóa phòng, thu hồi ghế và thông báo để khách về Sảnh. Khách rời: thu hồi token ghế khách, giữ mã/chủ phòng và xóa trạng thái sẵn sàng.
- Mất kết nối khác với Rời phòng: giữ ghế 60 giây, người quay lại phải sẵn sàng lại. Quá hạn xử lý như rời; kiểm tra hạn cả khi timer chưa chạy. Tải lại route Giải trí tự phục hồi phiên phòng đã lưu. Kết nối ở tab mới thay kết nối cũ như V1.
- Bàn cờ, đi quân, đầu hàng và nền theme V1 giữ nguyên. Chưa triển khai đồng hồ thi đấu, vật phẩm, cược, lời mời bạn bè, xếp hạng hoặc vòng chơi lại.

## Tích hợp và hợp đồng

Dùng chung `RoomsService`, map phòng, namespace `/rooms`, seat token và storage `xiangqi.room.v1` với V1. Các route `/rooms` cũ giữ nguyên; không chuyển phòng V1 cũ thành phòng Giải trí giữa chừng.

API mới qua proxy cùng origin `/api/casual-rooms` → Nest `/casual-rooms`:

| Thao tác | Body | Kết quả |
| --- | --- | --- |
| POST `/casual-rooms` | `{ themeId }` | 201, ghế Đỏ |
| POST `/casual-rooms/:code/join` | `{}` | 200, ghế Đen |
| POST `/casual-rooms/:code/ready` | `{ ready: boolean }` | 200 `{ ok: true }` |
| POST `/casual-rooms/:code/leave` | `{}` | 200 `{ ok: true }` |

Tất cả dùng AuthGuard, OriginGuard, pipe input và filter Base. Tái sử dụng access token trong bộ nhớ, không retry POST. Response/snapshot Giải trí có `casual: true`; player thêm `ready` và `avatar`. Handshake Giải trí kiểm tra cả seat token và access token của đúng tài khoản. `room:left` thông báo đóng/rời phòng. Snapshot trận không chứa deadline phòng chờ, giữ validator V1.

Giới hạn: phòng vẫn nằm trong RAM của **một tiến trình backend** như V1; khởi động lại server mất phòng. Chưa hỗ trợ đồng bộ phòng giữa nhiều instance hoặc lưu bền phòng vào PostgreSQL. Không thay đổi kiến trúc để mở rộng phạm vi này.

## File thay đổi trong đợt này

- Backend: `src/rooms/rooms.service.ts`, `rooms.types.ts`, `rooms.gateway.ts`, `rooms.module.ts`; thêm `casual-rooms.controller.ts`, `casual-request.pipe.ts`; `src/auth/auth.module.ts` export các provider xác thực hiện có.
- Frontend route: `src/app/play/page.tsx`, `src/app/lobby/page.tsx`; thêm `src/app/api/casual-rooms/route.ts`, `[...parts]/route.ts`.
- Frontend phòng: `PlayRoom.tsx`, `RoomForm.tsx`, `useRoomSession.ts`, `room-api.ts`, `room-contract.ts`, `room-socket.ts`, `room-storage.ts`; thêm `CasualPlayRoom.tsx`, `WaitingRoom.tsx`, `waiting-room.module.css`, `casual-client.ts`, `casual-proxy.ts` trong `src/features/rooms/`.
- `src/features/auth/auth-client.ts`: hàm lấy access token hiện hành; `src/features/lobby/Lobby.tsx`: link Giải trí, tiếp tục đúng loại phòng, toast khi rời/đóng.
- Test: thêm `apps/server/tests/casual-rooms.test.ts`, `casual-http-socket.test.ts`, `apps/web/e2e/casual-waiting.spec.mjs`; cập nhật `apps/web/e2e/lobby.spec.mjs`, `apps/web/tests/menu.test.mjs`.
- Tài liệu này và ảnh/số đo trong `docs/design/screenshots/casual-waiting/`. Các ảnh của bộ hồi quy hiện có cũng được cập nhật khi chạy lại.

## Kết quả thực tế

- Backend: **58 test đạt**; gồm sẵn sàng đồng thời, bật/bỏ, không tạo lại trận, mã sai, phòng đầy, tài khoản ngoài phòng, giả danh handshake, ghế theo tài khoản, rời/thu hồi token, reconnect, deadline đúng 60 giây và tương thích V1.
- Frontend unit: **77 test đạt**.
- Playwright toàn bộ: **35 passed, 17 skipped**. Bốn bài mới chạy trên desktop/mobile đều đạt với hai browser context và hai tài khoản xác thực độc lập; dùng PostgreSQL `xiangqi_dev` thật và Socket.IO thật. Tài khoản ngẫu nhiên của bài mới được xóa sau test, không gửi email.
- Hai ca đăng ký đọc mailbox local bỏ qua vì cấu hình SMTP thật; 15 ca khác bỏ qua theo project/viewport. Đợt này không kiểm chứng gửi email thật.
- Typecheck server/web, lint frontend, build server/web, `git diff --check`: đạt. Backend không có script lint riêng.
- Desktop 1366×768: document/clientHeight **768/768**, scrollY **0**, scrollWidth **1366**; mã, hai người chơi và nút Sẵn sàng nằm trọn viewport.
- Mobile 375×812: document/clientHeight **888/812**, scrollWidth **375**; cuộn dọc tự nhiên, không tràn ngang. Đã mở ảnh chụp cuối để rà bố cục và tiếng Việt.
- Ảnh: `waiting-desktop.png`, `waiting-mobile.png`; số đo: `metrics-desktop.json`, `metrics-mobile.json` trong thư mục trên.

## Tự thử bằng hai cửa sổ

1. Mở một cửa sổ thường và một cửa sổ ẩn danh, hoặc hai browser profile riêng. Đăng nhập **hai tài khoản đã xác minh khác nhau**. Hai cửa sổ thường cùng profile sẽ chia sẻ cookie/storage và không mô phỏng hai người độc lập.
2. Cửa sổ A: `/lobby` → Tạo phòng → chọn theme → Tạo phòng. Sao chép mã.
3. Cửa sổ B: `/lobby` → Vào bằng mã → dán mã → Vào phòng. Kiểm tra A là Đỏ, B là Đen và tên hai bên giống nhau trên hai cửa sổ.
4. A Sẵn sàng: vẫn ở phòng chờ. Thử Bỏ sẵn sàng. Tải lại A: giữ mã/ghế nhưng phải sẵn sàng lại. Hai bên Sẵn sàng: cả hai vào bàn cờ cùng theme.
5. Để thử rời, dùng phòng mới trước khi bắt đầu trận: B Rời phòng → A giữ mã và trở về Chưa sẵn sàng; B vào lại được. A Rời phòng → cả hai về Sảnh, B nhận toast phòng đóng.
6. Đóng tab trong phòng chờ khác với bấm Rời phòng: mở lại trước 60 giây để phục hồi; quá hạn ghế được giải phóng hoặc phòng bị đóng nếu là chủ.

Khởi động nếu cổng chưa có ứng dụng:

```powershell
npm.cmd run dev --workspace=@xiangqi/server
npm.cmd run dev --workspace=@xiangqi/web
```

Chạy lại kiểm tra tại repo (Playwright cần frontend 3000/backend 3001):

```powershell
npm.cmd run build --workspace=@xiangqi/server
npm.cmd run test --workspace=@xiangqi/server
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd exec --workspace=@xiangqi/web -- tsc --noEmit --incremental false
node --test apps/web/tests/*.test.mjs
npm.cmd run lint --workspace=@xiangqi/web
npm.cmd run test:e2e --workspace=@xiangqi/web -- casual-waiting.spec.mjs
npm.cmd run test:e2e --workspace=@xiangqi/web
npm.cmd run build --workspace=@xiangqi/web
git diff --check
```

Không commit, push, deploy, sửa `.env` hoặc migration trong đợt này.
