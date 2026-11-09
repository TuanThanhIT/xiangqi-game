import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../../db/database.service";
import { accounts } from "../../db/schema";
import { AUTH_CLOCK } from "../auth-clock";
import { verifyPassword } from "../password";
import { SessionService } from "../session/session.service";
import type { LoginInput } from "./login.pipe";

@Injectable()
export class LoginService {
  constructor(private readonly database: DatabaseService, private readonly sessions: SessionService, @Inject(AUTH_CLOCK) private readonly now: () => Date) {}
  async login(input: LoginInput) {
    const [account] = await this.database.db.select().from(accounts).where(eq(accounts.emailKey, input.email));
    if (!(await verifyPassword(input.password, account?.passwordHash)) || !account) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    if (!account.emailVerifiedAt) {
      if (account.pendingExpiresAt.getTime() <= this.now().getTime()) throw new ForbiddenException({ code: "REGISTRATION_EXPIRED" });
      throw new ForbiddenException({ code: "EMAIL_NOT_VERIFIED" });
    }
    return this.sessions.create(account.id);
  }

}
