CREATE TABLE "daily_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"cycle_day" integer NOT NULL,
	"consecutive_days" integer NOT NULL,
	"daily_reward" bigint NOT NULL,
	"weekly_bonus" bigint NOT NULL,
	"monthly_bonus" bigint NOT NULL,
	"total_reward" bigint NOT NULL,
	"wallet_available_after" bigint NOT NULL,
	"daily_entry_no" integer NOT NULL,
	"milestone_entry_no" integer,
	"claimed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daily_check_ins_cycle_day" CHECK ("daily_check_ins"."cycle_day" between 1 and 30),
	CONSTRAINT "daily_check_ins_consecutive" CHECK ("daily_check_ins"."consecutive_days" > 0),
	CONSTRAINT "daily_check_ins_rewards" CHECK ("daily_check_ins"."daily_reward" = 20 and "daily_check_ins"."weekly_bonus" >= 0 and "daily_check_ins"."monthly_bonus" >= 0 and "daily_check_ins"."total_reward" = "daily_check_ins"."daily_reward" + "daily_check_ins"."weekly_bonus" + "daily_check_ins"."monthly_bonus"),
	CONSTRAINT "daily_check_ins_entries" CHECK ("daily_check_ins"."daily_entry_no" > 0 and ("daily_check_ins"."milestone_entry_no" is null or "daily_check_ins"."milestone_entry_no" = "daily_check_ins"."daily_entry_no" + 1))
);
--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reason";--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reference";--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "check_in_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_check_ins_account_date_unique" ON "daily_check_ins" USING btree ("account_id","local_date");--> statement-breakpoint
CREATE INDEX "daily_check_ins_account_date_idx" ON "daily_check_ins" USING btree ("account_id","local_date");--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_check_in_id_daily_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."daily_check_ins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reason" CHECK ("wallet_entries"."reason" in ('starter_grant','bet_hold','bet_refund','bet_payout','item_purchase','casual_match_win_reward','daily_check_in_reward','check_in_7_day_bonus','check_in_30_day_bonus'));--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reference" CHECK (
    ("wallet_entries"."reason" = 'starter_grant' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null) or
    ("wallet_entries"."reason" in ('bet_hold','bet_refund','bet_payout') and "wallet_entries"."match_id" is not null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null) or
    ("wallet_entries"."reason" = 'item_purchase' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is not null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null) or
    ("wallet_entries"."reason" = 'casual_match_win_reward' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is not null and "wallet_entries"."check_in_id" is null) or
    ("wallet_entries"."reason" in ('daily_check_in_reward','check_in_7_day_bonus','check_in_30_day_bonus') and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is not null));