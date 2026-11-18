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
import { PasswordResetController } from "./password-reset/password-reset.controller";
import { PasswordResetService } from "./password-reset/password-reset.service";
import { PasswordResetConfirmPipe, PasswordResetRequestPipe } from "./password-reset/password-reset.pipe";

@Module({ imports: [DatabaseModule], controllers: [AuthController, RegistrationController,PasswordResetController],
  providers: [LoginService, SessionService, OtpService, AuthGuard, AuthOriginGuard, RegistrationService, OtpMailer,PasswordResetService,PasswordResetConfirmPipe,PasswordResetRequestPipe, { provide: AUTH_CLOCK, useValue: () => new Date() }], exports: [AuthGuard, AuthOriginGuard, SessionService,AUTH_CLOCK] })
export class AuthModule {}
