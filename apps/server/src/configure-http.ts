import { BadRequestException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

// Chỉ mô tả API parser thực sự dùng; không phụ thuộc kiểu request/response Express.
export interface JsonParserApplication extends INestApplication {
  useBodyParser(type: "json", options: { strict: boolean }): this;
}

export function configureHttp(app: JsonParserApplication): void {
  // Before the parser: malformed JSON and missing routes also receive an ID.
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const incoming = request.headers["x-request-id"];
    const requestId = typeof incoming === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming)
      ? incoming : randomUUID();
    request.headers["x-request-id"] = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });
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
