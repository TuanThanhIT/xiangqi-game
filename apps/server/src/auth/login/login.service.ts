import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
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
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'auth-email:'+input.email},0))`);
      const [account] = await tx.select().from(accounts).where(eq(accounts.emailKey, input.email)).for("update");
      if (!(await verifyPassword(input.password, account?.passwordHash)) || !account) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
      if (!account.emailVerifiedAt) {
        if (account.pendingExpiresAt.getTime() <= this.now().getTime()) throw new ForbiddenException({ code: "REGISTRATION_EXPIRED" });
        throw new ForbiddenException({ code: "EMAIL_NOT_VERIFIED" });
      }
      return this.sessions.create(account.id,tx as never);
    });
  }

}
