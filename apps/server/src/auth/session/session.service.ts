import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { DatabaseService } from "../../db/database.service";
import { accounts, avatars, sessions } from "../../db/schema";
import { ACCESS_SECONDS, authConfig, SESSION_MS } from "../auth.config";

import { AUTH_CLOCK } from "../auth-clock";
export const refreshDigest = (token: string): string => createHash("sha256").update(token).digest("hex");
export interface AuthProfile { id: string; email: string; nickname: string; avatar: { id: string; name: string; assetPath: string | null } }

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService, @Inject(AUTH_CLOCK) private readonly now: () => Date) {}

  private async profile(accountId: string): Promise<AuthProfile> {
    const [profile] = await this.database.db.select({ id: accounts.id, email: accounts.email, nickname: accounts.nickname,
      avatar: { id: avatars.id, name: avatars.name, assetPath: avatars.assetPath } }).from(accounts)
      .innerJoin(avatars, eq(accounts.avatarId, avatars.id)).where(and(eq(accounts.id, accountId), isNotNull(accounts.emailVerifiedAt)));
    if (!profile) throw new UnauthorizedException({ code: "SESSION_EXPIRED" });
    return profile;
  }

  private async access(session: typeof sessions.$inferSelect) {
    const now = Math.floor(this.now().getTime() / 1000);
    const expiry = Math.min(now + ACCESS_SECONDS, Math.floor(session.expiresAt.getTime() / 1000));
    if (expiry <= now) throw new UnauthorizedException({ code: "SESSION_EXPIRED" });
    const accessToken = await new SignJWT({ sid: session.id }).setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setSubject(session.accountId).setIssuer("xiangqi-server").setAudience("xiangqi-web").setIssuedAt(now)
      .setExpirationTime(expiry).sign(authConfig().key);
    return { accessToken, expiresAt: new Date(expiry * 1000).toISOString(), profile: await this.profile(session.accountId) };
  }

  async create(accountId: string) {
    // Validate config before creating the session.
    authConfig();
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const [session] = await this.database.db.insert(sessions).values({ accountId, refreshTokenHash: refreshDigest(token),
      createdAt, expiresAt: new Date(createdAt.getTime() + SESSION_MS) }).returning();
    return { result: await this.access(session), refreshToken: token, sessionExpiresAt: session.expiresAt };
  }

  async refresh(token: string | null) {
    if (!token) throw new UnauthorizedException({ code: "SESSION_EXPIRED" });
    const [session] = await this.database.db.select().from(sessions).where(and(eq(sessions.refreshTokenHash, refreshDigest(token)),
      isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now())));
    if (!session) throw new UnauthorizedException({ code: "SESSION_EXPIRED" });
    // Fixed token and fixed session deadline: concurrent refreshes do not invalidate each other.
    return this.access(session);
  }

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await this.database.db.update(sessions).set({ revokedAt: this.now() }).where(and(eq(sessions.refreshTokenHash, refreshDigest(token)), isNull(sessions.revokedAt)));
  }

  async authenticate(authorization: string | undefined): Promise<AuthProfile> {
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_.-]{1,4096})$/);
    if (!match) throw new UnauthorizedException({ code: "UNAUTHENTICATED" });
    let sid: string, subject: string;
    try {
      const { payload } = await jwtVerify(match[1], authConfig().key, { algorithms: ["HS256"], typ: "at+jwt",
        issuer: "xiangqi-server", audience: "xiangqi-web", requiredClaims: ["exp", "iat", "sub", "sid"], currentDate: this.now() });
      if (typeof payload.sid !== "string" || typeof payload.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.sid) ||
        !/^[0-9a-f-]{36}$/i.test(payload.sub)) throw new Error("Invalid claims");
      sid = payload.sid; subject = payload.sub;
    } catch { throw new UnauthorizedException({ code: "UNAUTHENTICATED" }); }
    const [session] = await this.database.db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sid),
      eq(sessions.accountId, subject), isNull(sessions.revokedAt), gt(sessions.expiresAt, this.now())));
    if (!session) throw new UnauthorizedException({ code: "SESSION_EXPIRED" });
    return this.profile(subject);
  }
}
