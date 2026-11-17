CREATE TABLE "mission_contributions" (
	"match_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"result_status" text NOT NULL,
	"reason" text NOT NULL,
	"completed_matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"captures" integer NOT NULL,
	"cannon_captures" integer NOT NULL,
	"item_usages" integer NOT NULL,
	"won_without_item" integer NOT NULL,
	"result_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "mission_contributions_match_id_account_id_version_pk" PRIMARY KEY("match_id","account_id","version"),
	CONSTRAINT "mission_contributions_version" CHECK ("mission_contributions"."version" > 0),
	CONSTRAINT "mission_contributions_values" CHECK ("mission_contributions"."completed_matches" between 0 and 1 and "mission_contributions"."wins" between 0 and 1 and "mission_contributions"."captures" >= 0 and "mission_contributions"."cannon_captures" >= 0 and "mission_contributions"."cannon_captures" <= "mission_contributions"."captures" and "mission_contributions"."item_usages" >= 0 and "mission_contributions"."won_without_item" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "mission_definitions" (
	"code" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"metric" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"target" integer NOT NULL,
	"reward_gold" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "mission_definitions_category" CHECK ("mission_definitions"."category" in ('daily','weekly','achievement')),
	CONSTRAINT "mission_definitions_metric" CHECK ("mission_definitions"."metric" in ('completed_matches','wins','captures','cannon_captures','item_usages','win_without_item')),
	CONSTRAINT "mission_definitions_values" CHECK ("mission_definitions"."target" > 0 and "mission_definitions"."reward_gold" >= 0 and "mission_definitions"."version" > 0 and "mission_definitions"."display_order" > 0)
);
--> statement-breakpoint
INSERT INTO "mission_definitions" ("code","category","metric","title","description","target","reward_gold","active","version","display_order") VALUES
('daily_complete_1','daily','completed_matches','Hoàn thành 1 trận','Hoàn thành một trận hợp lệ.',1,5,true,1,1),
('daily_complete_3','daily','completed_matches','Hoàn thành 3 trận','Hoàn thành ba trận hợp lệ.',3,10,true,1,2),
('daily_win_1','daily','wins','Thắng 1 trận','Thắng một trận hợp lệ.',1,10,true,1,3),
('daily_capture_5','daily','captures','Ăn 5 quân','Ăn năm quân trong các trận hợp lệ.',5,5,true,1,4),
('daily_capture_cannon','daily','cannon_captures','Ăn Pháo','Ăn ít nhất một quân Pháo.',1,5,true,1,5),
('daily_use_item','daily','item_usages','Dùng vật phẩm','Dùng thành công một vật phẩm.',1,5,true,1,6),
('daily_win_without_item','daily','win_without_item','Thắng không dùng vật phẩm','Thắng mà bản thân không dùng vật phẩm thành công.',1,10,true,1,7),
('weekly_complete_10','weekly','completed_matches','Hoàn thành 10 trận','Hoàn thành mười trận hợp lệ trong tuần.',10,25,true,1,1),
('weekly_complete_20','weekly','completed_matches','Hoàn thành 20 trận','Hoàn thành hai mươi trận hợp lệ trong tuần.',20,40,true,1,2),
('weekly_win_5','weekly','wins','Thắng 5 trận','Thắng năm trận trong tuần.',5,30,true,1,3),
('weekly_win_10','weekly','wins','Thắng 10 trận','Thắng mười trận trong tuần.',10,50,true,1,4),
('weekly_capture_40','weekly','captures','Ăn 40 quân','Ăn bốn mươi quân trong tuần.',40,25,true,1,5),
('weekly_capture_100','weekly','captures','Ăn 100 quân','Ăn một trăm quân trong tuần.',100,50,true,1,6),
('weekly_use_item_10','weekly','item_usages','Dùng 10 vật phẩm','Dùng thành công mười vật phẩm trong tuần.',10,30,true,1,7),
('weekly_win_no_item_3','weekly','win_without_item','Thắng 3 trận không dùng vật phẩm','Thắng ba trận mà bản thân không dùng vật phẩm.',3,30,true,1,8),
('achievement_first_win','achievement','wins','Chiến thắng đầu tiên','Thắng trận đầu tiên.',1,20,true,1,1),
('achievement_complete_10','achievement','completed_matches','Hoàn thành 10 trận','Hoàn thành mười trận.',10,30,true,1,2),
('achievement_complete_50','achievement','completed_matches','Hoàn thành 50 trận','Hoàn thành năm mươi trận.',50,80,true,1,3),
('achievement_complete_100','achievement','completed_matches','Hoàn thành 100 trận','Hoàn thành một trăm trận.',100,150,true,1,4),
('achievement_win_10','achievement','wins','Thắng 10 trận','Thắng mười trận.',10,50,true,1,5),
('achievement_win_50','achievement','wins','Thắng 50 trận','Thắng năm mươi trận.',50,120,true,1,6),
('achievement_win_100','achievement','wins','Thắng 100 trận','Thắng một trăm trận.',100,250,true,1,7),
('achievement_capture_100','achievement','captures','Ăn 100 quân','Ăn một trăm quân.',100,50,true,1,8),
('achievement_capture_500','achievement','captures','Ăn 500 quân','Ăn năm trăm quân.',500,200,true,1,9),
('achievement_use_item_50','achievement','item_usages','Dùng 50 vật phẩm','Dùng thành công năm mươi vật phẩm.',50,100,true,1,10)
ON CONFLICT ("code") DO UPDATE SET "category"=excluded."category","metric"=excluded."metric","title"=excluded."title",
"description"=excluded."description","target"=excluded."target","reward_gold"=excluded."reward_gold","active"=excluded."active",
"version"=excluded."version","display_order"=excluded."display_order";
--> statement-breakpoint
CREATE TABLE "mission_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"mission_code" text NOT NULL,
	"period_key" text NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"target_snapshot" integer NOT NULL,
	"reward_gold_snapshot" bigint NOT NULL,
	"definition_version" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"wallet_entry_no" integer,
	"wallet_available_after" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mission_progress_values" CHECK ("mission_progress"."progress" >= 0 and "mission_progress"."target_snapshot" > 0 and "mission_progress"."reward_gold_snapshot" >= 0 and "mission_progress"."definition_version" > 0),
	CONSTRAINT "mission_progress_status" CHECK ("mission_progress"."status" in ('in_progress','completed','claimed','expired')),
	CONSTRAINT "mission_progress_state" CHECK (
    ("mission_progress"."status" = 'in_progress' and "mission_progress"."completed_at" is null and "mission_progress"."claimed_at" is null and "mission_progress"."wallet_entry_no" is null and "mission_progress"."wallet_available_after" is null) or
    ("mission_progress"."status" = 'completed' and "mission_progress"."completed_at" is not null and "mission_progress"."claimed_at" is null and "mission_progress"."wallet_entry_no" is null and "mission_progress"."wallet_available_after" is null) or
    ("mission_progress"."status" = 'claimed' and "mission_progress"."completed_at" is not null and "mission_progress"."claimed_at" is not null and "mission_progress"."wallet_entry_no" is not null and "mission_progress"."wallet_available_after" is not null) or
    ("mission_progress"."status" = 'expired' and "mission_progress"."claimed_at" is null and "mission_progress"."wallet_entry_no" is null and "mission_progress"."wallet_available_after" is null))
);
--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reason";--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reference";--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "mission_progress_id" uuid;--> statement-breakpoint
ALTER TABLE "mission_contributions" ADD CONSTRAINT "mission_contributions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_mission_code_mission_definitions_code_fk" FOREIGN KEY ("mission_code") REFERENCES "public"."mission_definitions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mission_contributions_pending_idx" ON "mission_contributions" USING btree ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_definitions_display_unique" ON "mission_definitions" USING btree ("category","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_progress_account_code_period_unique" ON "mission_progress" USING btree ("account_id","mission_code","period_key");--> statement-breakpoint
CREATE INDEX "mission_progress_account_status_idx" ON "mission_progress" USING btree ("account_id","status");--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_mission_progress_id_mission_progress_id_fk" FOREIGN KEY ("mission_progress_id") REFERENCES "public"."mission_progress"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reason" CHECK ("wallet_entries"."reason" in ('starter_grant','bet_hold','bet_refund','bet_payout','item_purchase','casual_match_win_reward','daily_check_in_reward','check_in_7_day_bonus','check_in_30_day_bonus','mission_reward'));--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reference" CHECK (
    ("wallet_entries"."reason" = 'starter_grant' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null and "wallet_entries"."mission_progress_id" is null) or
    ("wallet_entries"."reason" in ('bet_hold','bet_refund','bet_payout') and "wallet_entries"."match_id" is not null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null and "wallet_entries"."mission_progress_id" is null) or
    ("wallet_entries"."reason" = 'item_purchase' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is not null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null and "wallet_entries"."mission_progress_id" is null) or
    ("wallet_entries"."reason" = 'casual_match_win_reward' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is not null and "wallet_entries"."check_in_id" is null and "wallet_entries"."mission_progress_id" is null) or
    ("wallet_entries"."reason" in ('daily_check_in_reward','check_in_7_day_bonus','check_in_30_day_bonus') and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is not null and "wallet_entries"."mission_progress_id" is null) or
    ("wallet_entries"."reason" = 'mission_reward' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null and "wallet_entries"."reward_match_id" is null and "wallet_entries"."check_in_id" is null and "wallet_entries"."mission_progress_id" is not null));
