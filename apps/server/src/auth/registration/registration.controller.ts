import { Body, Controller, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { AuthOriginGuard } from "../guards/origin.guard";
import { RegistrationService } from "./registration.service";
import { RegistrationPipe } from "./registration.pipe";
import { VerificationPipe } from "../otp/verification.pipe";
import { OtpService } from "../otp/otp.service";
import type { RegistrationInput } from "./registration.pipe";
import type { VerificationInput } from "../otp/verification.pipe";
import { LoginPipe } from "../login/login.pipe";
import type { LoginInput } from "../login/login.pipe";

interface Reply { setHeader(name: string, value: string): void }
@Controller("auth")
@UseGuards(AuthOriginGuard)
export class RegistrationController {
  constructor(private readonly registration: RegistrationService, private readonly otp: OtpService) {}
  @Post("verification/start") @HttpCode(200)
  start(@Body(LoginPipe) input: LoginInput, @Res({ passthrough: true }) response: Reply) {
    response.setHeader("Cache-Control", "no-store");
    return this.registration.fromLogin(input);
  }
  @Post("register") @HttpCode(200)
  register(@Body(RegistrationPipe) input: RegistrationInput, @Res({ passthrough: true }) response: Reply) {
    response.setHeader("Cache-Control", "no-store");
    return this.registration.register(input);
  }
  @Post("verification/status") @HttpCode(200)
  status(@Body(VerificationPipe) input: VerificationInput, @Res({ passthrough: true }) response: Reply) {
    response.setHeader("Cache-Control", "no-store");
    return this.otp.status(input.accountId);
  }
  @Post("verification/resend") @HttpCode(200)
  resend(@Body(VerificationPipe) input: VerificationInput, @Res({ passthrough: true }) response: Reply) {
    response.setHeader("Cache-Control", "no-store");
    return this.otp.resend(input.accountId);
  }
  @Post("verification/verify") @HttpCode(200)
  verify(@Body(VerificationPipe) input: VerificationInput, @Res({ passthrough: true }) response: Reply) {
    response.setHeader("Cache-Control", "no-store");
    return this.otp.verify(input.accountId, input.code);
  }
}
