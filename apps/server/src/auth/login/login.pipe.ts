import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

export interface LoginInput { email: string; password: string }

@Injectable()
export class LoginPipe implements PipeTransform<unknown, LoginInput> {
  transform(value: unknown): LoginInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_LOGIN_INPUT" });
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || typeof input.email !== "string" || typeof input.password !== "string" ||
      input.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      input.password.length === 0 || Buffer.byteLength(input.password, "utf8") > 1024) {
      throw new BadRequestException({ code: "INVALID_LOGIN_INPUT" });
    }
    return { email: input.email.trim().toLowerCase(), password: input.password };
  }
}
