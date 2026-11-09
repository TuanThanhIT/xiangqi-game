# Đồng hồ server cho Giải trí online

Bản kiểm tra: nhánh `master`, nền commit `e3ea4a4`, cùng diff phòng chờ chưa commit. Đợt này chỉ triển khai backend, dữ liệu đồng bộ và test; không sửa frontend, schema, migration, dependency hoặc `.env`.

## Quy tắc

- Tổng mỗi bên: 5/10/15/20/30 phút, mặc định 15. Chỉ chủ phòng đổi khi cả hai chưa Sẵn sàng; bắt đầu trận thì cố định.
- Đỏ chạy trước. Chỉ bên đang đi mất giờ tổng; mỗi lượt tối đa 60 giây. Nước sai/khác lượt/retry không đổi mốc. Nước hợp lệ được chấp nhận trước hạn mới chuyển lượt; tính cả thời gian server kiểm tra luật/kết quả. Đến đúng hạn bị từ chối.
- Mất kết nối không dừng đồng hồ. Giữ luật giữ ghế/deadline offline V1. Một người quá hạn khi đối thủ vẫn offline chưa quá hạn chưa đủ để chốt thắng; có thể hết giờ thi đấu trong lúc chờ.
- So thời điểm đủ điều kiện chốt: hết giờ thi đấu, thắng do offline, hoặc hủy khi cả hai quá hạn. Hạn trùng ưu tiên thi đấu; tổng trước lượt. Timer chạy muộn vẫn dùng deadline thực tế để quyết định và dừng giờ tại đó.
- Chỉ tăng revision một lần khi chốt hết giờ. Timer cũ có version/room identity; kết thúc hoặc shutdown hủy timer. Reconnect không khởi tạo đồng hồ và không ghi lại kết quả.
- Chỉ phòng `casual` có đồng hồ. Hợp đồng và hành vi phòng V1 cũ giữ nguyên. Phòng/giờ còn trong RAM của một backend, không phục hồi sau restart hay hỗ trợ nhiều instance.

## API NestJS

Tất cả dùng AuthGuard, OriginGuard và filter Base hiện có. Không tự retry POST.

| API | Body | Kết quả |
| --- | --- | --- |
| POST `/casual-rooms` | `{ "themeId": "earth", "totalMinutes": 15 }` | 201, SeatResponse cũ. `totalMinutes` tùy chọn, bỏ qua dùng 15 |
| POST `/casual-rooms/:code/time-control` | `{ "totalMinutes": 10 }` | 200 `{ "ok": true }`; phát lại trạng thái phòng |

Mức sai: 400 `INVALID_TIME_CONTROL`. Body thừa/thiếu trường: 400 `INVALID_REQUEST`. Khách đổi: 403 `NOT_ROOM_OWNER`; ngoài phòng: 403 `NOT_ROOM_MEMBER`; có người Sẵn sàng: 409 `PLAYERS_READY`; đã bắt đầu: 409 `GAME_ALREADY_STARTED`; phòng không tồn tại: 404 `ROOM_NOT_FOUND`. API tạo vẫn giữ mặc định cho request cũ chỉ có `themeId`.

`room:state` của phòng casual thêm `timeControl: { totalMs, turnMs }`. V1 cũ không thêm trường. Các mức cấu hình dùng **phút** ở HTTP; mọi trường `*Ms` trong snapshot dùng **mili giây**.

## `game:state`

Giữ `roomCode`, `game`, `playEnabled`, `serverNow`, `deadlines`; thêm `clock` khi trận casual bắt đầu. Khi còn phòng chờ không có `clock`. `deadlines.red/black` tiếp tục là hạn mất kết nối riêng, không dùng cho đồng hồ lượt/tổng.

| Trường trong `clock` | Ý nghĩa |
| --- | --- |
| `totalMs`, `turnMs` | Cấu hình cố định của trận |
| `remainingMs.red/black` | Quỹ tổng còn lại đã tính tới `serverNow`; khi kết thúc tính tới `stoppedAt` và cố định |
| `runningSide` | `red` / `black`, hoặc `null` sau kết thúc |
| `turnStartedAt` | Mốc bắt đầu lượt, epoch milliseconds |
| `turnDeadlineAt` | Hạn lượt tuyệt đối, epoch milliseconds |
| `totalDeadlineAt` | Hạn tổng của người đang đi trong lượt đó, epoch milliseconds |
| `stoppedAt` | `null` khi chơi; thời điểm chốt khi kết thúc, epoch milliseconds |

Kết quả thêm hai reason `turn_timeout`, `total_timeout`: `{ status: "finished", winner, loser, reason }`. `playEnabled` bằng false sau kết thúc. Board/lastMove giữ nguyên khi hết giờ, revision tăng một. Khi kết thúc bằng chiếu bí/hết nước/đầu hàng/offline, đồng hồ cũng dừng.

Frontend sau này có thể dùng `performance.now()` để đo thời gian trôi từ lúc nhận snapshot, ước lượng giờ server từ `serverNow`. Với người đang chạy: `max(0, remainingMs[side] - elapsedSinceSnapshotMs)`; bên kia giữ nguyên. Lượt còn lại: `max(0, turnDeadlineAt - estimatedServerNow)`. Hạn thực tế là min của `turnDeadlineAt` và `totalDeadlineAt`. Khi `runningSide === null` không trừ tiếp. Không gửi giờ client làm nguồn quyết định; việc UI đếm về 0 không tự chốt kết quả.

Không phát snapshot mỗi giây: dùng các mốc tuyệt đối. Snapshot phát qua cơ chế hiện có khi bắt đầu/đổi lượt/thay đổi kết nối/kết thúc, và được gửi lại khi socket gắn vào phòng.

### Ví dụ payload thời gian

Các ví dụ sau trích trường liên quan trong `game:state`; `game.pieces`, `game.lastMove`, `game.sideToMove` và các trường bàn cờ còn lại được gửi đầy đủ theo hợp đồng hiện có, không liệt kê lại ở đây. Các timestamp nhỏ dùng để dễ đối chiếu test đồng hồ giả; thực tế là epoch milliseconds.

Bắt đầu tại 1000, Đỏ đi trước:

```json
{
  "roomCode": "ABC234", "serverNow": 1000, "playEnabled": true,
  "deadlines": {"red": null, "black": null},
  "clock": {
    "totalMs": 900000, "turnMs": 60000,
    "remainingMs": {"red": 900000, "black": 900000},
    "runningSide": "red", "turnStartedAt": 1000,
    "turnDeadlineAt": 61000, "totalDeadlineAt": 901000, "stoppedAt": null
  }
}
```

Đỏ đi hợp lệ tại 11000, chuyển Đen; `game.revision` từ 0 thành 1:

```json
{
  "roomCode": "ABC234", "serverNow": 11000, "playEnabled": true,
  "deadlines": {"red": null, "black": null},
  "clock": {
    "totalMs": 900000, "turnMs": 60000,
    "remainingMs": {"red": 890000, "black": 900000},
    "runningSide": "black", "turnStartedAt": 11000,
    "turnDeadlineAt": 71000, "totalDeadlineAt": 911000, "stoppedAt": null
  }
}
```

Đen hết giờ lượt tại 71000, `game.revision` thành 2, `game.result` là `{ "status": "finished", "winner": "red", "loser": "black", "reason": "turn_timeout" }`. Nếu callback chạy muộn tại 72000:

```json
{
  "roomCode": "ABC234", "serverNow": 72000, "playEnabled": false,
  "deadlines": {"red": null, "black": null},
  "clock": {
    "totalMs": 900000, "turnMs": 60000,
    "remainingMs": {"red": 890000, "black": 840000},
    "runningSide": null, "turnStartedAt": 11000,
    "turnDeadlineAt": 71000, "totalDeadlineAt": 911000, "stoppedAt": 71000
  }
}
```

## Nối frontend ở lượt sau

Theo yêu cầu chỉ làm backend, chưa sửa Next proxy, type/validator hoặc UI. Validator hiện kiểm tra chính xác keys và không biết reason hết giờ mới, nên **frontend casual hiện tại chưa nhận được payload mới**: `room:state.timeControl`, `game:state.clock` và reason timeout cần được hỗ trợ trước khi nghiệm thu lại bằng trình duyệt. Next proxy cũng cần cho phép `totalMinutes` và route `time-control`. Chưa thể đổi thời gian qua UI hiện tại. Không dùng kết quả Playwright của lượt phòng chờ cũ để tuyên bố frontend tương thích.

## Kiểm tra và tự thử

```powershell
npm.cmd run test --workspace=@xiangqi/server
npm.cmd run typecheck --workspace=@xiangqi/server
npm.cmd run build --workspace=@xiangqi/server
git diff --check
```

Test backend: **73 pass, 0 fail, 0 skip**. Gồm 13 test đồng hồ giả mới, HTTP kiểm tra mức/quyền/khóa cấu hình, Socket.IO nhận thời gian và kết quả từ timer không có request mới, cùng hồi quy phòng và trận V1. Test deadline disconnect sớm/muộn có fixture gieo deadline riêng để kiểm tra phân xử độc lập với giới hạn hiện tại cùng là 60 giây.

Tự chạy lại bộ test trên để xác minh không phải chờ 5–30 phút thực. `casual-clock.test.ts` điều khiển thời gian, callback timer, nước đi hợp lệ, reconnect và retry. `casual-http-socket.test.ts` dựng Nest/Socket.IO thật trên cổng ngẫu nhiên với session giả, không gửi email hoặc sửa dữ liệu tài khoản. Frontend/Playwright chưa chạy trong đợt backend này.
