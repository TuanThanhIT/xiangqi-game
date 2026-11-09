import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const avatars = pgTable("avatars", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Image assets and avatar selection belong to the profile/UI step.
  assetPath: text("asset_path"),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  emailKey: text("email_key").generatedAlwaysAs(sql`lower(btrim(email))`).notNull().unique(),
  nickname: text("nickname").notNull(),
  nicknameKey: text("nickname_key").generatedAlwaysAs(sql`lower(btrim(regexp_replace(nickname, '[[:space:]]+', ' ', 'g')))` ).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarId: text("avatar_id").notNull().default("default").references(() => avatars.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  pendingExpiresAt: timestamp("pending_expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
  nicknameChangedAt: timestamp("nickname_changed_at", { withTimezone: true }),
}, (t) => [
  check("accounts_email_nonempty", sql`length(${t.emailKey}) > 0`),
  check("accounts_nickname_nonempty", sql`length(${t.nicknameKey}) > 0`),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '7 days'`),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("sessions_account_id_idx").on(t.accountId),
  check("sessions_expiry", sql`${t.expiresAt} > ${t.createdAt}`)]);

export const emailOtps = pgTable("auth_email_otps", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  digest: text("digest").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
}, (t) => [
  check("email_otps_purpose", sql`${t.purpose} in ('email_verification', 'password_reset')`),
  check("email_otps_attempts", sql`${t.failedAttempts} between 0 and 5`),
  check("email_otps_expiry", sql`${t.expiresAt} > ${t.sentAt}`),
  uniqueIndex("email_otps_one_active").on(t.accountId, t.purpose).where(sql`${t.consumedAt} is null and ${t.invalidatedAt} is null`),
]);

// No account FK: deleting an expired registration must not erase its email send quota.
export const emailSends = pgTable("auth_email_sends", {
  id: uuid("id").defaultRandom().primaryKey(),
  emailKey: text("email_key").notNull(),
  purpose: text("purpose").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: text("status").notNull(),
}, (t) => [
  check("email_sends_purpose", sql`${t.purpose} in ('email_verification', 'password_reset')`),
  check("email_sends_status", sql`${t.status} in ('sent', 'failed')`),
  index("email_sends_quota_idx").on(t.emailKey, t.attemptedAt),
]);
