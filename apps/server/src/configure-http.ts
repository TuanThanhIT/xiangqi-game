import { BadRequestException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";

// Chỉ mô tả API parser thực sự dùng; không phụ thuộc kiểu request/response Express.
export interface JsonParserApplication extends INestApplication {
  useBodyParser(type: "json", options: { strict: boolean }): this;
}

export function configureHttp(app: JsonParserApplication): void {
  // JSON hợp lệ nhưng sai kiểu phải đến pipe; strict parser mặc định chặn quá sớm.
  app.useBodyParser("json", { strict: false });
  app.use((error: unknown, _request: unknown, _response: unknown, next: (error?: unknown) => void) => {
    if (error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed" &&
        "status" in error && error.status === 400) {
      next(new BadRequestException({ code: "INVALID_JSON" }));
      return;
    }
    next(error);
  });
}
