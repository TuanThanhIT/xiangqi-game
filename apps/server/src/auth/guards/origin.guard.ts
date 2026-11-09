import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { authConfig } from "../auth.config";
import type { AuthRequest } from "./auth.guard";

@Injectable()
export class AuthOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<AuthRequest>().headers.origin;
    if (!origin || !authConfig().origins.includes(origin)) throw new ForbiddenException({ code: "ORIGIN_NOT_ALLOWED" });
    return true;
  }
}
