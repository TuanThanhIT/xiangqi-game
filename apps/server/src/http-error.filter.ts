import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";

const errors: Record<string, { status: number; message: string }> = {
  INVALID_BET: {status:400,message:"Mức cược phải là số vàng nguyên không âm."},
  INSUFFICIENT_GOLD: {status:409,message:"Chưa đủ vàng khả dụng để đặt cược. Vui lòng kiểm tra ví và sẵn sàng lại."},
  INVALID_WALLET_QUERY: {status:400,message:"Tham số xem lịch sử ví không hợp lệ."},
  INVALID_CHECK_IN_REQUEST: {status:400,message:"Yêu cầu điểm danh không hợp lệ."},
  WALLET_NOT_FOUND: {status:404,message:"Chưa có ví vàng cho tài khoản này."},
  WALLET_LIMIT: {status:400,message:"Biến động vượt giới hạn số dư ví."},
  BET_NOT_FOUND: {status:404,message:"Không tìm thấy thông tin cược."},
  ROOM_STARTING: {status:409,message:"Phòng đang xử lý bắt đầu trận. Vui lòng chờ."},
  ROOM_START_ABORTED: {status:409,message:"Chưa thể bắt đầu do trạng thái kết nối thay đổi. Vui lòng sẵn sàng lại."},
  NOT_ROOM_OWNER: {status:403,message:"Chỉ chủ phòng được đổi cấu hình."},
  NOT_ROOM_MEMBER: {status:403,message:"Bạn không thuộc phòng này."},
  PLAYERS_READY: {status:409,message:"Cả hai cần bỏ sẵn sàng trước khi đổi cấu hình."},
  GAME_ALREADY_STARTED: {status:409,message:"Trận đã bắt đầu, không thể đổi cấu hình phòng chờ."},
  INVALID_REGISTRATION_INPUT: { status: 400, message: "Kiểm tra email, mật khẩu và biệt danh." },
  INVALID_NICKNAME: { status: 400, message: "Biệt danh cần từ 1 đến 30 ký tự." },
  EMAIL_IN_USE: { status: 409, message: "Email đã có tài khoản. Vui lòng đăng nhập." },
  NICKNAME_IN_USE: { status: 409, message: "Biệt danh đã được sử dụng." },
  REGISTRATION_EXPIRED: { status: 410, message: "Hồ sơ chờ đã hết hạn. Vui lòng đăng ký lại." },
  INVALID_OTP_INPUT: { status: 400, message: "Nhập mã xác minh gồm 6 chữ số." },
  OTP_INVALID: { status: 400, message: "Mã xác minh không đúng." },
  OTP_EXPIRED: { status: 400, message: "Mã đã hết hiệu lực. Vui lòng yêu cầu mã mới." },
  OTP_LOCKED: { status: 400, message: "Mã đã hết hiệu lực sau 5 lần nhập sai. Vui lòng yêu cầu mã mới." },
  OTP_ALREADY_USED: { status: 409, message: "Email đã được xác minh. Vui lòng đăng nhập." },
  OTP_SEND_LIMIT: { status: 429, message: "Chưa thể gửi lại: cách nhau ít nhất 60 giây, tối đa 5 email mỗi giờ." },
  INVALID_LOGIN_INPUT: { status: 400, message: "Kiểm tra địa chỉ email và mật khẩu đã nhập." },
  INVALID_CREDENTIALS: { status: 401, message: "Email hoặc mật khẩu không đúng." },
  EMAIL_NOT_VERIFIED: { status: 403, message: "Email chưa được xác minh." },
  UNAUTHENTICATED: { status: 401, message: "Vui lòng đăng nhập để tiếp tục." },
  SESSION_EXPIRED: { status: 401, message: "Phiên đăng nhập đã hết hạn." },
  ORIGIN_NOT_ALLOWED: { status: 403, message: "Nguồn yêu cầu không được phép." },
  INVALID_REQUEST: { status: 400, message: "Request không đúng định dạng: kiểm tra biệt danh, phong cách và các trường được phép." },
  INVALID_ROOM_CODE: { status: 400, message: "Mã phòng không hợp lệ." },
  INVALID_JSON: { status: 400, message: "JSON không hợp lệ." },
  ROOM_NOT_FOUND: { status: 404, message: "Phòng không tồn tại." },
  ROOM_FULL: { status: 409, message: "Phòng đã đủ hai người." },
  ROOM_CODE_UNAVAILABLE: { status: 503, message: "Chưa thể tạo mã phòng. Vui lòng thử lại." },
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    let statusCode = 500;
    let code = "INTERNAL_ERROR";
    let message = "Đã xảy ra lỗi nội bộ.";
    // INVALID_JSON đã được nhận diện tại middleware trước khi Nest bọc lỗi parser.
    if (error instanceof HttpException) {
      statusCode = error.getStatus();
      const body = error.getResponse();
      code = typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
        ? body.code : statusCode === 404 ? "NOT_FOUND" : statusCode < 500 ? "REQUEST_ERROR" : "INTERNAL_ERROR";
      if (statusCode >= 500 && code !== "ROOM_CODE_UNAVAILABLE") code = "INTERNAL_ERROR";
      if (statusCode < 500) message = "Yêu cầu không hợp lệ.";
    }
    if (Object.hasOwn(errors, code)) {
      statusCode = errors[code].status;
      message = errors[code].message;
    }
    const response = host.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: object): void };
    }>();
    // Không ghi error/body/response ra log để tránh lộ token hoặc dữ liệu request.
    response.setHeader("Cache-Control", "no-store");
    response.status(statusCode).json({ statusCode, code, message });
  }
}
