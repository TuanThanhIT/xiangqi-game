import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";

const errors: Record<string, { status: number; message: string }> = {
  INVALID_REQUEST: { status: 400, message: "Body chỉ được chứa nickname là chuỗi dài 1–30 ký tự sau khi trim." },
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
      status(code: number): { json(body: object): void };
    }>();
    // Không ghi error/body/response ra log để tránh lộ token hoặc dữ liệu request.
    response.status(statusCode).json({ statusCode, code, message });
  }
}
