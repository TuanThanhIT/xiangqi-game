CREATE TABLE "wagers" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"red_account_id" uuid NOT NULL,
	"black_account_id" uuid NOT NULL,
	"stake" bigint NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	CONSTRAINT "wagers_stake" CHECK ("wagers"."stake" > 0 and "wagers"."stake" <= 9007199254740991),
	CONSTRAINT "wagers_players" CHECK ("wagers"."red_account_id" <> "wagers"."black_account_id"),
	CONSTRAINT "wagers_status" CHECK ("wagers"."status" in ('held','result_pending','settled','refunded')),
	CONSTRAINT "wagers_result_state" CHECK (("wagers"."status" = 'held' and "wagers"."result" is null and "wagers"."result_at" is null and "wagers"."settled_at" is null) or ("wagers"."status" = 'result_pending' and "wagers"."result" is not null and "wagers"."result_at" is not null and "wagers"."settled_at" is null) or ("wagers"."status" in ('settled','refunded') and "wagers"."result" is not null and "wagers"."result_at" is not null and "wagers"."settled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"account_id" uuid NOT NULL,
	"entry_no" integer NOT NULL,
	"operation_key" text NOT NULL,
	"reason" text NOT NULL,
	"match_id" uuid,
	"available_delta" bigint NOT NULL,
	"held_delta" bigint NOT NULL,
	"available_after" bigint NOT NULL,
	"held_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entries_account_id_entry_no_pk" PRIMARY KEY("account_id","entry_no"),
	CONSTRAINT "wallet_entries_reason" CHECK ("wallet_entries"."reason" in ('starter_grant','bet_hold','bet_refund','bet_payout')),
	CONSTRAINT "wallet_entries_balances" CHECK ("wallet_entries"."available_after" >= 0 and "wallet_entries"."held_after" >= 0 and "wallet_entries"."entry_no" > 0),
	CONSTRAINT "wallet_entries_match" CHECK (("wallet_entries"."reason" = 'starter_grant' and "wallet_entries"."match_id" is null) or ("wallet_entries"."reason" <> 'starter_grant' and "wallet_entries"."match_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"available_gold" bigint DEFAULT 0 NOT NULL,
	"held_gold" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "wallets_balances" CHECK ("wallets"."available_gold" >= 0 and "wallets"."held_gold" >= 0 and "wallets"."available_gold" + "wallets"."held_gold" <= 9007199254740991),
	CONSTRAINT "wallets_version" CHECK ("wallets"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_red_account_id_wallets_account_id_fk" FOREIGN KEY ("red_account_id") REFERENCES "public"."wallets"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_black_account_id_wallets_account_id_fk" FOREIGN KEY ("black_account_id") REFERENCES "public"."wallets"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_account_id_wallets_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallets"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_match_id_wagers_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."wagers"("match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wagers_status_idx" ON "wagers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_operation_unique" ON "wallet_entries" USING btree ("account_id","operation_key");
--> statement-breakpoint
-- Account verification and the one-time grant share the same transaction.
CREATE FUNCTION grant_wallet_starter(target_id uuid) RETURNS void
LANGUAGE sql SET search_path FROM CURRENT AS $$
  WITH created AS (
    INSERT INTO wallets (account_id, available_gold, held_gold, version)
    SELECT id, 100, 0, 1 FROM accounts WHERE id = target_id AND email_verified_at IS NOT NULL
    ON CONFLICT (account_id) DO NOTHING RETURNING account_id
  )
  INSERT INTO wallet_entries (account_id, entry_no, operation_key, reason, available_delta, held_delta, available_after, held_after)
  SELECT account_id, 1, 'starter', 'starter_grant', 100, 0, 100, 0 FROM created;
$$;
--> statement-breakpoint
CREATE FUNCTION grant_wallet_on_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM grant_wallet_starter(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER accounts_wallet_starter AFTER INSERT OR UPDATE OF email_verified_at ON accounts
FOR EACH ROW WHEN (NEW.email_verified_at IS NOT NULL) EXECUTE FUNCTION grant_wallet_on_verification();
--> statement-breakpoint
SELECT grant_wallet_starter(id) FROM accounts WHERE email_verified_at IS NOT NULL;
