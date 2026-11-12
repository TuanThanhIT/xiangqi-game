CREATE TABLE "casual_match_results" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"red_account_id" uuid NOT NULL,
	"black_account_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"reason" text NOT NULL,
	"winner_account_id" uuid,
	"reward_policy" text DEFAULT 'casual_win_reward_v1' NOT NULL,
	"reward_amount" bigint DEFAULT 5 NOT NULL,
	"reward_eligible" boolean NOT NULL,
	"reward_status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"wallet_entry_no" integer,
	"wallet_available_after" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone,
	CONSTRAINT "casual_match_results_players" CHECK ("casual_match_results"."red_account_id" <> "casual_match_results"."black_account_id"),
	CONSTRAINT "casual_match_results_reward_amount" CHECK ("casual_match_results"."reward_amount" = 5),
	CONSTRAINT "casual_match_results_reward_state" CHECK (
    ("casual_match_results"."reward_eligible" and "casual_match_results"."winner_account_id" is not null and "casual_match_results"."reward_status" in ('pending','credited')) or
    (not "casual_match_results"."reward_eligible" and "casual_match_results"."reward_status" = 'not_eligible' and "casual_match_results"."wallet_entry_no" is null and "casual_match_results"."wallet_available_after" is null and "casual_match_results"."credited_at" is null)),
	CONSTRAINT "casual_match_results_credit_state" CHECK (
    ("casual_match_results"."reward_status" = 'credited' and "casual_match_results"."wallet_entry_no" is not null and "casual_match_results"."wallet_available_after" is not null and "casual_match_results"."credited_at" is not null) or
    ("casual_match_results"."reward_status" <> 'credited' and "casual_match_results"."wallet_entry_no" is null and "casual_match_results"."wallet_available_after" is null and "casual_match_results"."credited_at" is null))
);
--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reason";--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reference";--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "reward_match_id" uuid;--> statement-breakpoint
ALTER TABLE "casual_match_results" ADD CONSTRAINT "casual_match_results_red_account_id_accounts_id_fk" FOREIGN KEY ("red_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casual_match_results" ADD CONSTRAINT "casual_match_results_black_account_id_accounts_id_fk" FOREIGN KEY ("black_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casual_match_results" ADD CONSTRAINT "casual_match_results_winner_account_id_accounts_id_fk" FOREIGN KEY ("winner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "casual_match_results_idempotency_unique" ON "casual_match_results" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "casual_match_results_reward_status_idx" ON "casual_match_results" USING btree ("reward_status");--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reward_match_id_casual_match_results_match_id_fk" FOREIGN KEY ("reward_match_id") REFERENCES "public"."casual_match_results"("match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reason" CHECK ("wallet_entries"."reason" in ('starter_grant','bet_hold','bet_refund','bet_payout','item_purchase','casual_match_win_reward'));--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reference" CHECK (
    ("wallet_entries"."reason" = 'starter_grant' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null) or
    ("wallet_entries"."reason" in ('bet_hold','bet_refund','bet_payout') and "wallet_entries"."match_id" is not null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null) or
    ("wallet_entries"."reason" = 'item_purchase' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is not null and "wallet_entries"."reward_match_id" is null) or
    ("wallet_entries"."reason" = 'casual_match_win_reward' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is not null));