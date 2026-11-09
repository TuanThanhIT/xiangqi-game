import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { LoginPipe } from "../login/login.pipe";

export interface RegistrationInput { email: string; password: string; nickname: string }
@Injectable()
export class RegistrationPipe implements PipeTransform<unknown, RegistrationInput> {
  transform(value: unknown): RegistrationInput {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException({ code: "INVALID_REGISTRATION_INPUT" });
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== 3 || typeof input.nickname !== "string") throw new BadRequestException({ code: "INVALID_REGISTRATION_INPUT" });
    const nickname = input.nickname.trim().replace(/\s+/gu, " ");
    if (!nickname || Array.from(nickname).length > 30) throw new BadRequestException({ code: "INVALID_NICKNAME" });
    // Registration does not impose a new password policy not present in the product spec.
    let credentials;
    try { credentials = new LoginPipe().transform({ email: input.email, password: input.password }); }
    catch { throw new BadRequestException({ code: "INVALID_REGISTRATION_INPUT" }); }
    return { ...credentials, nickname };
  }
}
