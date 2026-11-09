import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const wallets = pgTable("wallets", {
  accountId: uuid("account_id").primaryKey().references(() => accounts.id, {onDelete:"cascade"}),
  availableGold: bigint("available_gold",{mode:"number"}).notNull().default(0),
  heldGold: bigint("held_gold",{mode:"number"}).notNull().default(0),
  version: integer("version").notNull().default(0),
},t=>[
  check("wallets_balances",sql`${t.availableGold} >= 0 and ${t.heldGold} >= 0 and ${t.availableGold} + ${t.heldGold} <= 9007199254740991`),
  check("wallets_version",sql`${t.version} >= 0`),
]);

export const wagers = pgTable("wagers", {
  matchId: uuid("match_id").primaryKey(),
  roomCode: text("room_code").notNull(),
  redAccountId: uuid("red_account_id").notNull().references(()=>wallets.accountId),
  blackAccountId: uuid("black_account_id").notNull().references(()=>wallets.accountId),
  stake: bigint("stake",{mode:"number"}).notNull(),
  status: text("status").notNull(),
  result: jsonb("result").$type<{status:"finished";winner:"red"|"black";loser:"red"|"black";reason:string}|{status:"draw"|"cancelled";reason:string}>(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  resultAt: timestamp("result_at",{withTimezone:true}),
  settledAt: timestamp("settled_at",{withTimezone:true}),
},t=>[
  check("wagers_stake",sql`${t.stake} > 0 and ${t.stake} <= 9007199254740991`),
  check("wagers_players",sql`${t.redAccountId} <> ${t.blackAccountId}`),
  check("wagers_status",sql`${t.status} in ('held','result_pending','settled','refunded')`),
  check("wagers_result_state",sql`(${t.status} = 'held' and ${t.result} is null and ${t.resultAt} is null and ${t.settledAt} is null) or (${t.status} = 'result_pending' and ${t.result} is not null and ${t.resultAt} is not null and ${t.settledAt} is null) or (${t.status} in ('settled','refunded') and ${t.result} is not null and ${t.resultAt} is not null and ${t.settledAt} is not null)`),
  index("wagers_status_idx").on(t.status),
]);

export const walletEntries = pgTable("wallet_entries", {
  accountId: uuid("account_id").notNull().references(()=>wallets.accountId,{onDelete:"cascade"}),
  entryNo: integer("entry_no").notNull(),
  operationKey: text("operation_key").notNull(),
  reason: text("reason").notNull(),
  matchId: uuid("match_id").references(()=>wagers.matchId),
  availableDelta: bigint("available_delta",{mode:"number"}).notNull(),
  heldDelta: bigint("held_delta",{mode:"number"}).notNull(),
  availableAfter: bigint("available_after",{mode:"number"}).notNull(),
  heldAfter: bigint("held_after",{mode:"number"}).notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  primaryKey({columns:[t.accountId,t.entryNo]}),
  uniqueIndex("wallet_entries_operation_unique").on(t.accountId,t.operationKey),
  check("wallet_entries_reason",sql`${t.reason} in ('starter_grant','bet_hold','bet_refund','bet_payout')`),
  check("wallet_entries_balances",sql`${t.availableAfter} >= 0 and ${t.heldAfter} >= 0 and ${t.entryNo} > 0`),
  check("wallet_entries_match",sql`(${t.reason} = 'starter_grant' and ${t.matchId} is null) or (${t.reason} <> 'starter_grant' and ${t.matchId} is not null)`),
]);
