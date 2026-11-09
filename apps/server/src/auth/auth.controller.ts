import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { LoginService } from "./login/login.service";
import { SessionService } from "./session/session.service";
import { LoginPipe } from "./login/login.pipe";
import type { LoginInput } from "./login/login.pipe";
import { AuthGuard } from "./guards/auth.guard";
import type { AuthRequest } from "./guards/auth.guard";
import { AuthOriginGuard } from "./guards/origin.guard";
import { clearRefreshCookie, readRefreshCookie, refreshCookie } from "./auth.config";

interface AuthResponse { setHeader(name: string, value: string): void }

@Controller()
export class AuthController {
  constructor(private readonly auth: SessionService, private readonly loginService: LoginService) {}

  @Post("auth/login") @HttpCode(200) @UseGuards(AuthOriginGuard)
  async login(@Body(LoginPipe) input: LoginInput, @Res({ passthrough: true }) response: AuthResponse) {
    response.setHeader("Cache-Control", "no-store");
    const { result, refreshToken, sessionExpiresAt } = await this.loginService.login(input);
    response.setHeader("Set-Cookie", refreshCookie(refreshToken, sessionExpiresAt));
    return result;
  }

  @Post("auth/refresh") @HttpCode(200) @UseGuards(AuthOriginGuard)
  async refresh(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse) {
    response.setHeader("Cache-Control", "no-store");
    try { return await this.auth.refresh(readRefreshCookie(request.headers.cookie)); }
    catch (error) {
      // Expired sessions clear the stale cookie; transient DB errors keep it for retry.
      if (error instanceof Error && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 401) response.setHeader("Set-Cookie", clearRefreshCookie());
      throw error;
    }
  }

  @Post("auth/logout") @HttpCode(200) @UseGuards(AuthOriginGuard)
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse) {
    response.setHeader("Cache-Control", "no-store");
    await this.auth.logout(readRefreshCookie(request.headers.cookie));
    response.setHeader("Set-Cookie", clearRefreshCookie());
    return { ok: true };
  }

  @Get("me") @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest, @Res({ passthrough: true }) response: AuthResponse) {
    response.setHeader("Cache-Control", "no-store");
    return request.profile;
  }
}
