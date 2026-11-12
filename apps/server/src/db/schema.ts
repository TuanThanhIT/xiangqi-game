import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const shopItems = pgTable("shop_items", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  groupCode: text("group_code").notNull(),
  priceGold: bigint("price_gold", { mode: "number" }).notNull(),
  onSale: boolean("on_sale").notNull().default(true),
  displayOrder: integer("display_order").notNull(),
  version: integer("version").notNull().default(1),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  starterQuantity: integer("starter_quantity").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("shop_items_code", sql`${t.code} ~ '^[a-z][a-z0-9_]{1,63}$'`),
  check("shop_items_price", sql`${t.priceGold} >= 0 and ${t.priceGold} <= 9007199254740991`),
  check("shop_items_order_version", sql`${t.displayOrder} > 0 and ${t.version} > 0 and ${t.starterQuantity} >= 0`),
  uniqueIndex("shop_items_display_order_unique").on(t.displayOrder),
]);

export const inventoryItems = pgTable("inventory_items", {
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull().references(() => shopItems.code),
  quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.accountId, t.itemCode] }),
  check("inventory_items_quantity", sql`${t.quantity} >= 0 and ${t.quantity} <= 9007199254740991`),
]);

export const inventoryStarterGrants = pgTable("inventory_starter_grants", {
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull().references(() => shopItems.code),
  quantity: integer("quantity").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.accountId, t.itemCode] }), check("inventory_starter_grants_quantity", sql`${t.quantity} > 0`)]);

export const itemPurchases = pgTable("item_purchases", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  itemCode: text("item_code").notNull().references(() => shopItems.code),
  quantity: integer("quantity").notNull(),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  totalPrice: bigint("total_price", { mode: "number" }).notNull(),
  inventoryQuantityAfter: bigint("inventory_quantity_after", { mode: "number" }).notNull(),
  availableGoldAfter: bigint("available_gold_after", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("item_purchases_request_unique").on(t.accountId, t.requestId),
  check("item_purchases_quantity", sql`${t.quantity} between 1 and 99`),
  check("item_purchases_amounts", sql`${t.unitPrice} >= 0 and ${t.totalPrice} = ${t.unitPrice} * ${t.quantity} and ${t.inventoryQuantityAfter} >= 0 and ${t.availableGoldAfter} >= 0`),
]);

export const matchLoadouts = pgTable("match_loadouts", {
  matchId: uuid("match_id").notNull(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull().references(() => shopItems.code),
  slot: integer("slot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.matchId, t.accountId, t.itemCode] }),
  uniqueIndex("match_loadouts_slot_unique").on(t.matchId, t.accountId, t.slot),
  check("match_loadouts_slot", sql`${t.slot} between 1 and 3`),
]);

export const itemUsages = pgTable("item_usages", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  requestId: uuid("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  itemCode: text("item_code").notNull().references(() => shopItems.code),
  targetPieceId: text("target_piece_id"),
  status: text("status").notNull().default("committed"),
  acceptedAt: timestamp("accepted_at", {withTimezone:true}).notNull(),
  committedAt: timestamp("committed_at", {withTimezone:true}).notNull().defaultNow(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  quantityConsumed: integer("quantity_consumed").notNull().default(1),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
}, t => [
  uniqueIndex("item_usages_request_unique").on(t.matchId, t.accountId, t.requestId),
  uniqueIndex("item_usages_loadout_unique").on(t.matchId, t.accountId, t.itemCode),
  check("item_usages_committed", sql`${t.status} = 'committed' and ${t.quantityConsumed} = 1`),
]);

export type CasualMatchResult =
  {status:"finished";winner:"red"|"black";loser:"red"|"black";reason:string} |
  {status:"draw"|"cancelled";reason:string};

export const casualMatchResults = pgTable("casual_match_results", {
  matchId: uuid("match_id").primaryKey(),
  roomCode: text("room_code").notNull(),
  redAccountId: uuid("red_account_id").notNull().references(() => accounts.id),
  blackAccountId: uuid("black_account_id").notNull().references(() => accounts.id),
  result: jsonb("result").$type<CasualMatchResult>().notNull(),
  reason: text("reason").notNull(),
  winnerAccountId: uuid("winner_account_id").references(() => accounts.id),
  rewardPolicy: text("reward_policy").notNull().default("casual_win_reward_v1"),
  rewardAmount: bigint("reward_amount", {mode:"number"}).notNull().default(5),
  rewardEligible: boolean("reward_eligible").notNull(),
  rewardStatus: text("reward_status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  walletEntryNo: integer("wallet_entry_no"),
  walletAvailableAfter: bigint("wallet_available_after", {mode:"number"}),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
  creditedAt: timestamp("credited_at", {withTimezone:true}),
}, t => [
  uniqueIndex("casual_match_results_idempotency_unique").on(t.idempotencyKey),
  index("casual_match_results_reward_status_idx").on(t.rewardStatus),
  check("casual_match_results_players", sql`${t.redAccountId} <> ${t.blackAccountId}`),
  check("casual_match_results_reward_amount", sql`${t.rewardAmount} = 5`),
  check("casual_match_results_reward_state", sql`
    (${t.rewardEligible} and ${t.winnerAccountId} is not null and ${t.rewardStatus} in ('pending','credited')) or
    (not ${t.rewardEligible} and ${t.rewardStatus} = 'not_eligible' and ${t.walletEntryNo} is null and ${t.walletAvailableAfter} is null and ${t.creditedAt} is null)`),
  check("casual_match_results_credit_state", sql`
    (${t.rewardStatus} = 'credited' and ${t.walletEntryNo} is not null and ${t.walletAvailableAfter} is not null and ${t.creditedAt} is not null) or
    (${t.rewardStatus} <> 'credited' and ${t.walletEntryNo} is null and ${t.walletAvailableAfter} is null and ${t.creditedAt} is null)`),
]);

export const walletEntries = pgTable("wallet_entries", {
  accountId: uuid("account_id").notNull().references(()=>wallets.accountId,{onDelete:"cascade"}),
  entryNo: integer("entry_no").notNull(),
  operationKey: text("operation_key").notNull(),
  reason: text("reason").notNull(),
  matchId: uuid("match_id").references(()=>wagers.matchId),
  rewardMatchId: uuid("reward_match_id").references(()=>casualMatchResults.matchId),
  purchaseId: uuid("purchase_id").references(()=>itemPurchases.id),
  availableDelta: bigint("available_delta",{mode:"number"}).notNull(),
  heldDelta: bigint("held_delta",{mode:"number"}).notNull(),
  availableAfter: bigint("available_after",{mode:"number"}).notNull(),
  heldAfter: bigint("held_after",{mode:"number"}).notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  primaryKey({columns:[t.accountId,t.entryNo]}),
  uniqueIndex("wallet_entries_operation_unique").on(t.accountId,t.operationKey),
  check("wallet_entries_reason",sql`${t.reason} in ('starter_grant','bet_hold','bet_refund','bet_payout','item_purchase','casual_match_win_reward')`),
  check("wallet_entries_balances",sql`${t.availableAfter} >= 0 and ${t.heldAfter} >= 0 and ${t.entryNo} > 0`),
  check("wallet_entries_reference",sql`
    (${t.reason} = 'starter_grant' and ${t.matchId} is null and ${t.purchaseId} is null and ${t.rewardMatchId} is null) or
    (${t.reason} in ('bet_hold','bet_refund','bet_payout') and ${t.matchId} is not null and ${t.purchaseId} is null and ${t.rewardMatchId} is null) or
    (${t.reason} = 'item_purchase' and ${t.matchId} is null and ${t.purchaseId} is not null and ${t.rewardMatchId} is null) or
    (${t.reason} = 'casual_match_win_reward' and ${t.matchId} is null and ${t.purchaseId} is null and ${t.rewardMatchId} is not null)`),
]);
