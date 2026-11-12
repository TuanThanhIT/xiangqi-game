# Đặc tả Xiangqi Game · Đợt Giải trí

Bản 0.5 · 05/11/2026 · Tổng hợp các quyết định nghiệp vụ để nghiệm thu theo từng đợt.

## 1. Phạm vi và thứ tự bàn giao

1. **Giải trí** — tài khoản, hồ sơ, chơi local, phòng online, bạn bè và lời mời, chat trong trận, vật phẩm, vàng nội bộ, cửa hàng, kho, điểm danh, nhiệm vụ và lịch sử.
2. **Xếp hạng** — bắt đầu sau khi Giải trí được nghiệm thu. Bảng hạng, ghép trận, bot, Top 50 và thưởng thăng hạng sẽ có đặc tả riêng.
3. **Nhân vật và skin** — sau Xếp hạng mới thiết kế nhân vật cho các quân cờ, sau đó đặc tả mua bán, mở khóa và trang bị nhân vật/skin.

Tận dụng bàn cờ, luật, phòng online và năm phong cách bàn từ V1. Giải trí dùng vàng nội bộ. Bán lại vật phẩm, chat riêng, voice, phát lại ván, lặp thế, chiếu dai và đuổi dai để đợt sau. PostgreSQL và migration đã chốt. ERD, API và triển khai là bước kế tiếp.

## 2. Tài khoản, hồ sơ và phiên

- Đăng ký bằng email, mật khẩu và biệt danh. Biệt danh duy nhất, bỏ khoảng trắng thừa hai đầu và gộp khoảng trắng giữa từ. So trùng bỏ qua hoa/thường, giữ phân biệt dấu. Hiển thị đúng cách viết hoa đã chọn. Đổi trong hồ sơ tối đa một lần mỗi 30 ngày, tên mới phải duy nhất.
- Cấp avatar mặc định. Người chơi đổi avatar từ bộ ảnh có sẵn trong hồ sơ. Hiện biệt danh và avatar trong trận.
- Xác minh email bằng OTP rồi quay về đăng nhập. Hồ sơ chờ giữ biệt danh 24 giờ kể từ đăng ký. Hết hạn thì giải phóng tên và phải đăng ký lại. Gửi lại mã không gia hạn hồ sơ.
- Đăng ký lại cùng email đang chờ đưa người chơi về bước xác minh. Đăng nhập đúng email và mật khẩu của hồ sơ đang chờ cũng đưa về bước đó. Có thể dùng mã còn hạn hoặc chủ động yêu cầu mã mới.
- Quên mật khẩu qua email → OTP riêng → đặt mật khẩu mới → đăng nhập lại. Đặt lại thành công thu hồi mọi phiên.
- OTP có hạn 5 phút kể từ khi gửi. Hai lần gửi cách nhau ít nhất 60 giây. Mã mới vô hiệu mã cũ cùng mục đích. Sai 5 lần thì mã hết hiệu lực. Tối đa 5 email OTP/giờ cho mỗi địa chỉ, tính cả lần đầu và tính chung hai luồng.
- Access token giữ trong bộ nhớ trang, hạn 15 phút. Refresh token trong cookie HttpOnly, hạn cố định 7 ngày từ đăng nhập. Tải lại hoặc hết access token thì xin cấp mới nếu phiên còn hiệu lực. API xác thực đi cùng origin qua Next.js đến NestJS. Production dùng HTTPS, cookie Secure và SameSite=Lax, kiểm tra Origin ở API xác thực dùng cookie. Đăng xuất chỉ thu hồi phiên hiện tại.
- Khách chơi local được. Tạo hoặc vào phòng Giải trí online yêu cầu đăng nhập. Cổng game dẫn tới sảnh Xiangqi, có lối tới các chức năng đã phát hành và hướng dẫn tương tác cách đi bảy loại quân.

## 3. Phòng, lượt chơi và kết quả

- Chủ phòng tạo mã mời. Chọn phong cách bàn từ V1, bật/tắt vật phẩm, mức cược vàng và thời gian tổng mỗi bên 5/10/15/20/30 phút, mặc định 15. Hai tùy chọn cược và vật phẩm độc lập. Khách thấy thiết lập trước khi vào. Cùng thiết lập được giữ khi chơi lại.
- Chỉ chủ phòng được đổi thời gian tổng khi cả hai chưa Sẵn sàng. Nếu đã có người Sẵn sàng, phải Bỏ sẵn sàng trước; đổi cấu hình không tự bỏ trạng thái này. Bắt đầu trận thì cố định thời gian.
- Chủ phòng luôn Đỏ đi trước, khách luôn Đen. Mỗi tài khoản chỉ giữ một ghế trong một phòng Giải trí, kể cả nhiều tab. Đang chơi thì tiếp tục hoặc xác nhận đầu hàng trước khi chuyển phòng.
- Trong phòng chờ, mỗi bên chọn vật phẩm nếu bật, rồi bấm Sẵn sàng để khóa lựa chọn. Bỏ sẵn sàng trước lúc bắt đầu để đổi. Server bắt đầu khi cả hai online và sẵn sàng. Nếu thiếu vàng cược, giữ nguyên số dư và ở phòng chờ, bên thiếu vàng cần xác nhận lại.
- Khách rời phòng chờ thì giải phóng ghế, chủ phòng giữ mã. Chủ phòng rời thì đóng phòng và đưa khách về màn hình Giải trí. Mất kết nối ở phòng chờ giữ ghế 60 giây. Quay lại đúng hạn phải sẵn sàng lại. Quá hạn xử lý như rời phòng.
- Sau kết quả, có nút Về phòng chờ để chơi tiếp cùng mã. Cả hai chọn lại vật phẩm và sẵn sàng cho ván mới. Có thể rời phòng từ kết quả. Kết quả, lịch sử và vàng đã quyết toán được giữ.
- Trong lượt, đồng hồ tổng của bên đang đi và đồng hồ lượt 60 giây đếm song song. Nước hợp lệ được server chấp nhận thì dừng hai đồng hồ đó. Bên kia bắt đầu lượt mới 60 giây và dùng số thời gian tổng còn lại. Đồng hồ nào về 0 trước khi server chấp nhận nước đi thì bên đó thua. Dùng vật phẩm không dừng đồng hồ. Áp dụng cả phòng bật và tắt vật phẩm.
- Trong trận, mất kết nối khóa thao tác nhưng đồng hồ thi đấu tiếp tục chạy; tải lại/reconnect không cấp lại thời gian tổng hoặc lượt. Mỗi người offline có hạn quay lại riêng 60 giây. Quay lại đúng hạn giữ ghế và bàn nếu trận chưa kết thúc. Một bên quá hạn thì thua nếu bên kia online và còn quyền thắng. Nếu cả hai quá hạn thì hủy, kể cả một người đã quay lại muộn. Nếu một người quá hạn còn người kia offline nhưng chưa hết hạn, chờ người kia quay lại đúng hạn để xử thắng hoặc chờ họ hết hạn để hủy, trừ khi đồng hồ thi đấu kết thúc trận trước. Quy tắc cửa sổ vật phẩm được xác định ở lượt triển khai vật phẩm.
- Nước đi được server chấp nhận phải trước hạn tuyệt đối; đến đúng hạn bị từ chối. Server tự chốt kết quả không cần request mới, theo thời điểm có thể chốt sớm nhất giữa hết giờ và luật mất kết nối. Trùng deadline ưu tiên hết giờ thi đấu; giờ tổng trùng giờ lượt thì ghi lý do hết giờ tổng. Kết quả chỉ chốt một lần, kể cả callback timer chạy muộn hoặc reconnect sau đó.
- Đầu hàng xử thua ngay, kể cả ngoài lượt hoặc đối thủ offline. Mỗi người được xin hòa một lần mỗi ván. Đề nghị có hiệu lực 15 giây, đồng hồ thi đấu vẫn theo trạng thái trận. Nếu đối thủ chấp nhận trước khi hết hạn và trước khi trận kết thúc thì hòa. Từ chối hoặc hết hạn thì chơi tiếp. Bản đầu chỉ có hòa do hai bên đồng ý.
- Server xác nhận trạng thái và kết quả. Nước sai luật bị từ chối. Trong phòng có vật phẩm, chỉ xử chiếu bí hoặc hết nước khi người chơi không có nước đi hợp lệ và cũng không thể dùng một món khả dụng rồi đi một nước hợp lệ.

## 4. Vật phẩm và giá cửa hàng

Mỗi người chọn từ 0 đến 3 món khác loại từ kho trước trận. Chỉ chủ sở hữu thấy món chưa dùng và số món mang theo, kể cả sau trận. Chọn món, xem tác dụng, chọn mục tiêu nếu cần và bấm Dùng vật phẩm. Mỗi lượt kích hoạt tối đa một món rồi vẫn đi một nước. Server chỉ cho kích hoạt nếu sau đó có ít nhất một nước hợp lệ. Chỉ trừ món khi kích hoạt thành công. Món đã dùng vẫn tiêu hao khi hòa hoặc hủy.

| Món | Giá vàng | Tác dụng |
|---|---:|---|
| Trinh sát | 30 | Xem các đích hợp lệ của một quân đối thủ theo thế hiện tại nếu đến lượt họ. Chỉ người dùng thấy các đích gợi ý. |
| Tiết kiệm thời gian | 40 | Nếu server chấp nhận nước đi trong vòng 10 giây thi đấu sau kích hoạt và trước hạn, hoàn thời gian đã dùng kể từ kích hoạt vào quỹ tổng. Trừ món ngay khi kích hoạt, kể cả khi không được hoàn giờ. |
| Phá ấn | 50 | Gỡ Phong ấn khỏi một quân mình để quân đó có thể đi ngay trong lượt. |
| Phá khiên | 50 | Gỡ Khiên của một quân đối thủ. Muốn ăn quân vẫn phải đi nước ăn hợp lệ. |
| Thời áp | 60 | Trừ tối đa 15 giây tổng của đối thủ, chừa ít nhất 10 giây. Nếu họ còn 10 giây trở xuống, từ chối dùng. |
| Gia hạn | 70 | Cộng 30 giây vào quỹ tổng của mình. |
| Tĩnh tâm | 80 | Cộng 15 giây vào đồng hồ lượt hiện tại của mình. |
| Khiên | 100 | Bảo vệ một quân mình, trừ Tướng, khỏi bị ăn suốt lượt kế tiếp của đối thủ. Quân vẫn có thể di chuyển. |
| Phong ấn | 130 | Khóa di chuyển một quân đối thủ, trừ Tướng, trong lượt kế tiếp của họ. Quân vẫn có thể bị ăn. |
| Hồi sinh | 180 | Đưa một quân mình đã mất, trừ Tướng, về đúng giao điểm ban đầu của chính quân đó. Từ chối nếu điểm đang có quân hoặc sau hồi sinh Tướng mình vẫn bị chiếu. |

Giá là cấu hình thử nghiệm. Khiên và Phong ấn độc lập, cùng tồn tại được và hết hạn theo lượt, kể cả sau khi tạm dừng do mất kết nối. Có thể dùng vật phẩm khi đang bị chiếu. Nếu Tướng vẫn bị chiếu sau một món được phép dùng, nước tiếp theo phải giải chiếu. Khi dùng thành công, cả hai thấy món, mục tiêu nếu có và hiệu ứng trên bàn. Khiên và Phong ấn có biểu tượng xem tác dụng và hạn. Hồi sinh thông báo quân trở lại. Trinh sát chỉ công khai việc đã dùng món, giữ riêng kết quả.

Quyết định triển khai backend vật phẩm:

- Vật phẩm hỗ trợ thời gian chỉ tác động đồng hồ người sử dụng; vật phẩm tấn công thời gian có thể tác động đối thủ theo đặc tả riêng. Thời áp trừ tối đa 15 giây quỹ tổng đối thủ nhưng luôn chừa 10 giây, không đổi giờ lượt và bị từ chối nếu đối thủ còn tối đa 10 giây.
- Item action dùng `requestId` và `expectedVersion`; chỉ transaction thành công mới tiêu hao. Retry cùng payload không áp dụng hoặc tiêu hao lần hai. Mỗi loại trong snapshot loadout dùng tối đa một lần trong trận và mỗi lượt chỉ dùng một món.
- Trinh sát dùng effects hiện tại, kết quả rỗng vẫn thành công. Đối thủ chỉ biết món đã dùng; mục tiêu và các đích là dữ liệu riêng, gắn với stateVersion và trở thành stale khi bàn/effects đổi.
- Tiết kiệm thời gian nhận nước tại biên `<= 10.000 ms`, không vượt quỹ tổng ban đầu. Gia hạn cũng không vượt quỹ ban đầu và phải cộng được ít nhất 1 ms. Tĩnh tâm chỉ cộng 15 giây cho lượt hiện tại.
- Khiên và Phong ấn có hiệu lực ngay, hết sau lượt kế tiếp của đối thủ, không cộng dồn hoặc làm mới. Phong ấn loại quân khỏi di chuyển, ăn, vùng tấn công, chiếu và bảo vệ nhưng quân vẫn cản đường vật lý. Hết ấn có thể tạo chiếu ở ranh giới lượt mà không hoàn tác nước vừa đi.
- Quân bị ăn mất mọi effect. Hồi sinh dùng đúng `pieceId`, ô khai cuộc phải trống, Tướng phải an toàn ngay sau hồi sinh và quân trở lại không mang effect cũ.
- Nếu không còn nước cờ, server mô phỏng từng món chưa dùng trong snapshot với từng mục tiêu. Chỉ khi không có một món tạo được ít nhất một nước hợp lệ mới xử thua do chiếu bí hoặc hết nước.
- Đồng hồ không dừng trong lúc chờ transaction. Mốc chấp nhận là lần kiểm tra cuối trước transaction; action đã qua mốc này tiếp tục khi disconnect. Commit chưa rõ được đối soát theo requestId trước khi mở gameplay tiếp.

## 5. Vàng, cửa hàng và nhiệm vụ

- Quà cấp một lần sau xác minh email gồm 100 vàng và một món mỗi loại trong bảng, tổng cộng 10 món.
- Chủ phòng nhập mức cược nguyên từ 0 tới số dư vàng khả dụng. 0 là không cược. Hai bên góp bằng nhau. Server kiểm tra số dư và giữ cả hai khoản trong cùng giao dịch khi bắt đầu. Khi có người thắng, trả toàn bộ quỹ cược cho người đó, kể cả thắng do đầu hàng, hết giờ hoặc quá hạn kết nối. Hòa hoặc hủy thì hoàn đúng phần mỗi bên đã góp.
- Chỉ chủ phòng đổi mức cược khi cả hai chưa Sẵn sàng; bắt đầu trận thì khóa mức cược. Kiểm tra vàng khả dụng lại trong giao dịch giữ cược. Thiếu vàng không giữ lẻ một bên và bên thiếu cần Sẵn sàng lại.
- Cược lưu theo matchId duy nhất, với trạng thái held, result_pending, settled, refunded. Lưu kết quả server bền vững trước quyết toán; cập nhật ví, lịch sử và trạng thái quyết toán trong cùng giao dịch. Retry không phát/trừ vàng lặp. Khi restart làm mất trận RAM: held chưa có kết quả bền vững được hủy và hoàn cả hai, kể cả kết quả từng hiện trên UI; result_pending tiếp tục quyết toán theo kết quả đã lưu; settled/refunded không đổi. Khôi phục chạy trước khi nhận trận mới trên một backend instance. DB lỗi thì chờ/retry, vàng giữ cược chưa khả dụng; chỉ báo đã quyết toán khi commit thành công.
- Thưởng thắng Giải trí online thêm 5 vàng nếu thắng bằng chiếu bí, đối thủ hết nước, hết giờ thi đấu hoặc đầu hàng. Áp dụng có và không cược. Quá hạn kết nối, hòa, hủy và reason ngoài allowlist không phát khoản này. Vàng thưởng, nhiệm vụ và cược là các khoản riêng.
- Cửa hàng cho mua nhiều bản cùng loại một lần. Xem số lượng, tổng giá và vàng còn lại trước khi xác nhận. Server kiểm tra giá/số dư và cập nhật ví, kho cùng giao dịch. Thiếu vàng thì giữ nguyên cả hai. Lịch sử ví ghi thời gian, lý do, số cộng/trừ và số dư sau giao dịch. Dòng mua ghi tên món, số lượng và tổng giá. Kho hiển thị số lượng còn lại.
- Điểm danh và nhiệm vụ dùng chung tài khoản, mở từ sảnh, nhận vào cùng ví. Điểm danh một lần mỗi ngày theo giờ Việt Nam, được 20 vàng. Thêm 50 vàng ở ngày 7/14/21/28 và 200 ở ngày 30. Đủ chu kỳ nhận 1.000 vàng. Sau ngày 30 hoặc khi bỏ lỡ một ngày, lần điểm danh kế tiếp bắt đầu ngày 1.
- Nhiệm vụ ngày đợt đầu tính từ Giải trí online, có hoặc không cược. Xếp hạng có thể dùng chung nhiệm vụ phù hợp sau khi ra mắt. Mỗi nhiệm vụ nhận một lần mỗi ngày. Hoàn thành thì mở mục Nhiệm vụ bấm Nhận thưởng đến hết ngày hôm sau theo giờ Việt Nam. Ngày mới có tiến độ riêng.

| Nhiệm vụ | Điều kiện | Vàng |
|---|---|---:|
| Khởi động | Hoàn thành 1 trận | 5 |
| Bền bỉ | Hoàn thành 3 trận | 10 |
| Bắt 5 quân | Ăn 5 quân khác nhau trong cùng trận | 15 |
| Hạ Pháo | Ăn ít nhất 1 Pháo đối thủ | 10 |
| Săn Xe | Ăn ít nhất 1 Xe đối thủ | 12 |
| Phá thế chiếu | Đi 2 nước giải chiếu hợp lệ, có thể qua nhiều trận | 8 |
| Thắng một ván | Thắng bằng chiếu bí, đối thủ hết nước hoặc hết giờ | 15 |
| Thử vật phẩm | Kích hoạt thành công 1 món trong phòng bật vật phẩm | 5 |

Tổng tối đa 80 vàng nhiệm vụ/ngày. Khởi động và Bền bỉ chỉ tính trận kết thúc bằng chiếu bí, hết nước hoặc hết giờ. Tiến độ ăn quân, giải chiếu và dùng vật phẩm vẫn tính nếu đối thủ đầu hàng. Trận bị hủy không tính. Quân hồi sinh rồi bị ăn lại chỉ tính một lần vào Bắt 5 quân. Một hành động có thể đóng góp vào nhiều nhiệm vụ.

## 6. Bạn bè, chat và lịch sử

- Tìm người chơi theo biệt danh duy nhất, gửi lời mời kết bạn. Quan hệ chỉ có hiệu lực khi người nhận chấp nhận. Một bên có thể hủy, làm mất quyền xem lịch sử qua hồ sơ của nhau. Trận đã đấu chung vẫn xem được trong lịch sử của chính mình.
- Chủ phòng còn ghế trống có thể mời bạn bè online. Lời mời hiển thị người mời, mức cược, thời gian và tùy chọn vật phẩm. Hạn 60 giây, không giữ ghế. Hết hiệu lực ngay nếu phòng đóng hoặc ghế đã có người. Khách vào rồi vẫn phải sẵn sàng.
- Hai người chat chữ và emoji trong trận. Mỗi tin tối đa 200 ký tự, mỗi người tối đa 3 tin trong bất kỳ 5 giây, tính chung chữ và emoji. Vượt hạn thì báo chờ và giữ bản đang soạn. Có nút Ẩn chat đối thủ trong ván, ẩn tin, emoji và dấu báo tin mới. Chat đóng khi ván kết thúc và không lưu trong lịch sử.
- Lịch sử đấu hiển thị đối thủ, thời gian, kết quả, lý do kết thúc. Chi tiết có bàn cuối và vật phẩm đã dùng. Chủ hồ sơ thấy thêm lãi/lỗ vàng cược và thưởng thắng. Bạn bè xem được chi tiết trận nhưng phần vàng, số dư, lịch sử ví và kho chỉ chủ tài khoản thấy.

## 7. Mốc nghiệm thu

| Đợt | Kiểm tra bàn giao |
|---|---|
| Tài khoản | Đăng ký, xác minh, đăng nhập, hết hạn OTP, khôi phục mật khẩu, thu hồi phiên, biệt danh trùng và avatar trong trận. |
| Phòng Giải trí | Hai tài khoản tạo/vào bằng mã hoặc lời mời, chọn theme, sẵn sàng, hết giờ, reconnect, đầu hàng, hòa, hủy và chơi lại đúng thiết lập. |
| Vật phẩm | Kiểm tra từng món, quyền xem bộ riêng, tương tác Khiên/Phong ấn, khả năng giải chiếu, tiêu hao đúng một lần và phục hồi hiệu ứng sau reconnect. |
| Kinh tế | Quà một lần, mua nguyên tử, giữ và quyết toán cược, hoàn khi hòa/hủy, điểm danh qua mốc ngày và nhận nhiệm vụ đúng hạn. Gửi lại yêu cầu không phát hoặc trừ vàng lần hai. |
| Cộng đồng | Kết bạn, lời mời hết hạn, quyền xem lịch sử, chat và ẩn chat. |
| Phát hành | Kiểm thử hai trình duyệt, desktop và 375px, bàn phím, migration trên môi trường thử nghiệm, sao lưu/khôi phục và hướng dẫn quay lui. |

Khi thiết kế API cần xác định thứ tự xử lý hành động cạnh deadline, chuyển ngày Việt Nam trong trận, xử lý tiến độ nhiệm vụ khi trận phân thắng thua do mất kết nối, và các quy tắc phục hồi sau restart. Các điểm này cần được làm rõ trước khi triển khai phần phụ thuộc.
