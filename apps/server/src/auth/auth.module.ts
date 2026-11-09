import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module";
import { AuthController } from "./auth.controller";
import { AUTH_CLOCK } from "./auth-clock";
import { SessionService } from "./session/session.service";
import { LoginService } from "./login/login.service";
import { OtpService } from "./otp/otp.service";
import { AuthGuard } from "./guards/auth.guard";
import { AuthOriginGuard } from "./guards/origin.guard";
import { RegistrationController } from "./registration/registration.controller";
import { RegistrationService } from "./registration/registration.service";
import { OtpMailer } from "./otp/delivery/otp-mailer";

@Module({ imports: [DatabaseModule], controllers: [AuthController, RegistrationController],
  providers: [LoginService, SessionService, OtpService, AuthGuard, AuthOriginGuard, RegistrationService, OtpMailer, { provide: AUTH_CLOCK, useValue: () => new Date() }], exports: [AuthGuard, AuthOriginGuard, SessionService] })
export class AuthModule {}
