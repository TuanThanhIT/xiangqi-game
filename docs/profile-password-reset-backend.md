# Backend hồ sơ, avatar và đặt lại mật khẩu

## API

| Endpoint | Guard | Payload | Kết quả |
|---|---|---|---|
| `GET /profile` | Auth | Không có | Profile của access token hiện tại |
| `GET /profile/avatars` | Auth | Không có | `{ items: [{ id, name, assetPath }] }` từ DB |
| `PATCH /profile/nickname` | Auth + Origin | `{ nickname }` strict | Profile mới |
| `PATCH /profile/avatar` | Auth + Origin | `{ avatarId }` strict | Profile mới |
| `POST /auth/password-reset/request` | Origin | `{ email }` strict | Generic accepted chống enumeration |
| `POST /auth/password-reset/confirm` | Origin | `{ email, otp, newPassword }` strict | `{ ok: true }`, clear refresh cookie |

Profile trả `id`, email, thời điểm xác minh/tạo, nickname, avatar và trạng thái cooldown; không trả password hash, normalized key, pending state, session, wallet hoặc inventory. Timestamp dùng ISO 8601.

## Nickname và avatar

Nickname dùng đúng normalization đăng ký: trim, gộp whitespace, tối đa 30 Unicode code point; uniqueness cuối cùng do generated `nickname_key` và constraint PostgreSQL bảo vệ. Account row được khóa trong transaction. Đổi thật cập nhật `nicknameChangedAt`; lần kế tiếp chỉ hợp lệ tại hoặc sau đúng 30×24 giờ. Giá trị có cùng normalized key là no-op thành công, không đổi timestamp và không tiêu cooldown. Lỗi cooldown trả `retryAfterMs` và `nextNicknameChangeAt`.

Catalog avatar chỉ đọc các bản ghi thật trong `avatars`, sắp theo ID. Hiện có thể chỉ có `default`; backend không seed avatar/asset mới, không upload, crop hoặc tạo đường dẫn giả. Chọn lại avatar hiện tại là no-op. Match history cũ tiếp tục dùng snapshot cũ.

## Password reset

Reset tái sử dụng `auth_email_otps`/`auth_email_sends` với purpose `password_reset`, HMAC-SHA256 tách domain khỏi `email_verification`, clock, mailer và scrypt hiện có. Schema này đã tồn tại đầy đủ từ migration cũ nên không cần migration 0010. Development vẫn ở 0009.

Request luôn trả cùng status/shape cho email tồn tại, không tồn tại, chưa xác minh, cooldown, quota hoặc delivery failure. Chỉ account đã xác minh mới có mail. Email thành công cách nhau ít nhất 60 giây và dùng quota chung tối đa 5 mail trong cửa sổ trượt một giờ. Gửi thành công mới vô hiệu mã cũ và kích hoạt mã mới; SMTP failure giữ challenge cũ có thể dùng.

OTP gồm 6 chữ số, hết hạn sau 5 phút, tối đa 5 lần sai và chỉ dùng một lần. Confirm khóa account/challenge trong transaction, đổi password hash, consume OTP và revoke toàn bộ refresh session. Retry sau thành công nhận lỗi generic. Response thành công clear refresh cookie nhưng không tạo session hay tự đăng nhập. Access token đã phát có thể còn hiệu lực tối đa 15 phút theo kiến trúc JWT hiện tại.

Error code: `INVALID_NICKNAME`, `NICKNAME_ALREADY_IN_USE`, `NICKNAME_CHANGE_COOLDOWN`, `INVALID_AVATAR`, `AVATAR_NOT_FOUND`, `PROFILE_NOT_FOUND`, `INVALID_PASSWORD_RESET_REQUEST`, `INVALID_OR_EXPIRED_RESET_CODE`.

## Tự thử và frontend

Chạy `test:profile` và `test:password-reset` bằng fake clock/mailer; không gửi email thật. Frontend sau này gọi qua proxy cùng origin, không tự retry mutation, hiển thị cooldown từ server, chỉ render avatar DB trả về, giữ public response reset generic, và quay về login sau confirm. Không tuyên bố frontend đã hoàn thành.
