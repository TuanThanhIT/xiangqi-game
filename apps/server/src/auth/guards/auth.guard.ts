import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";
import { SessionService } from "../session/session.service";
import type { AuthProfile } from "../session/session.service";

export interface AuthRequest { headers: IncomingHttpHeaders; profile?: AuthProfile }
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.profile = await this.auth.authenticate(request.headers.authorization);
    return true;
  }
}
