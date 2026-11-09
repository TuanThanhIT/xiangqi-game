import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

export interface VerificationInput { accountId: string; code?: string }
@Injectable()
export class VerificationPipe implements PipeTransform<unknown, VerificationInput> {
  transform(value: unknown): VerificationInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_OTP_INPUT" });
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["accountId", "code"].includes(key)) || typeof input.accountId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.accountId) ||
      (Object.hasOwn(input, "code") && (typeof input.code !== "string" || !/^\d{6}$/.test(input.code)))) throw new BadRequestException({ code: "INVALID_OTP_INPUT" });
    return { accountId: input.accountId, ...(typeof input.code === "string" ? { code: input.code } : {}) };
  }
}
