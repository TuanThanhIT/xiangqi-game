# Chỉ dẫn làm việc trong dự án

- Trao đổi và giải thích bằng tiếng Việt.
- Chỉ thực hiện nhiệm vụ đã được giao.
- Khi được yêu cầu khảo sát hoặc đề xuất, chưa tạo/sửa file.
- Khi nhiệm vụ đã được duyệt, được triển khai chi tiết trong phạm vi đã duyệt.
- Hỏi người dùng trước khi thêm dependency, đổi kiến trúc, thay luật cờ hoặc thêm tính năng ngoài phạm vi.
- Không ghi đè thay đổi của người dùng.
- Không đưa tiền, cửa hàng, nâng cấp hoặc nạp tiền vào V1.
- Sau mỗi nhiệm vụ, báo các thay đổi, lý do, kiểm tra đã chạy, giới hạn và kiến thức người dùng cần hiểu.
- Không báo kiểm tra thành công nếu chưa thực sự chạy.
- Trên máy Windows này, dùng `npm.cmd` thay cho `npm`.

## Quy tắc kiến trúc

- Backend chia theo tính năng: controller nhận HTTP, pipe kiểm tra input, guard kiểm tra quyền, service xử lý nghiệp vụ và truy cập Drizzle qua lớp DB hiện có.
- Frontend dùng `app/` cho route/layout và `features/` cho logic theo tính năng. Browser gọi API cùng origin qua Next.js; NestJS sở hữu nghiệp vụ, quyền truy cập và kết nối DB.
- Giữ hợp đồng HTTP và Socket.IO V1. Thay đổi schema phải dùng migration mới; không sửa migration đã áp dụng.
- HTTP dùng `x-request-id` để đối chiếu qua Next.js và NestJS. Không tự retry POST. Không log body, mật khẩu, token, cookie hoặc DATABASE_URL.

## Quy tắc bố cục màn hình

- Cổng game, Auth, Sảnh, Phòng chờ và Bàn đấu: trạng thái thông thường phải hiện trọn ở 1366×768 và 1440×900, zoom 100%, không cuộn toàn trang. Với Bàn đấu, ưu tiên toàn bộ bàn cờ, lượt và nút thao tác chính.
- Màn hình danh sách dài như Cửa hàng, Kho, Nhiệm vụ và Lịch sử được cuộn. Trong màn game cố định, chat hoặc danh sách dài cuộn trong vùng riêng khi cần.
- Ở 375px, khi zoom lớn, mở bàn phím ảo hoặc nội dung lỗi làm form dài hơn, cho cuộn tự nhiên để mọi điều khiển vẫn truy cập được. Không khóa overflow trên body/root để che nội dung tràn.

## Quy tắc trình bày form

- Form sạch gọn, không chừa vùng rỗng cho lỗi. Dùng khoảng cách bình thường giữa các ô và 16–20px từ nhóm ô cuối đến nút gửi. Chỉ render lỗi trường khi có lỗi, ngay dưới ô cách 4–6px; giữ chiều rộng card ổn định, cho chữ xuống dòng và form giãn tự nhiên.
- Lỗi sửa được tại một ô dùng aria-invalid/aria-describedby, viền báo lỗi và focus ô sai đầu tiên sau submit; giữ dữ liệu đã nhập. OTP hết hạn dùng toast nhắc thao tác Gửi lại mã.
- Thông báo kết quả thao tác (thành công hoặc thất bại) và trạng thái cần báo cho người dùng dùng toast ngoài luồng form, không hiện banner/Notice hoặc thông báo trùng trong form. Dùng thông báo tiếng Việt an toàn theo mã lỗi đã biết; mã lạ dùng thông báo chung. Toast không đổi kích thước card, không giật focus, tồn tại tới khi đóng hoặc gửi lại; nút đóng dùng được bằng bàn phím và lỗi mới được thông báo cho trình đọc màn hình. Mobile tránh che ô đang nhập và nút chính.
- Form mới dùng lại quy ước này; kiểm tra trạng thái sạch, đang gửi, lỗi trường và toast. Desktop 1366×768 và 1440×900 ở zoom 100% phải thấy trọn trạng thái bình thường và thao tác chính, không cuộn toàn trang.
- Với lỗi trường dài, mobile 375px, zoom lớn hoặc bàn phím ảo, cho cuộn tự nhiên để đọc đủ và thao tác được, không tràn ngang. Không dùng overflow: hidden trên trang để che phần tràn. Giữ quy tắc cuộn của danh sách dài/chat nêu trên.
