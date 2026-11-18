CREATE TABLE "match_history" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'casual' NOT NULL,
	"room_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"result" text,
	"reason" text,
	"red_account_id" uuid NOT NULL,
	"black_account_id" uuid NOT NULL,
	"winner_account_id" uuid,
	"winner_side" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" bigint,
	"total_ms" integer NOT NULL,
	"turn_ms" integer NOT NULL,
	"theme_id" text NOT NULL,
	"items_enabled" boolean NOT NULL,
	"wager_stake" bigint DEFAULT 0 NOT NULL,
	"move_count" integer DEFAULT 0 NOT NULL,
	"has_activity" boolean DEFAULT false NOT NULL,
	"final_board" jsonb,
	"detail_level" text DEFAULT 'full' NOT NULL,
	"finalization_version" integer DEFAULT 1 NOT NULL,
	"wager_status" text DEFAULT 'none' NOT NULL,
	"reward_status" text DEFAULT 'pending' NOT NULL,
	"mission_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_history_mode" CHECK ("match_history"."mode" in ('casual','ranked')),
	CONSTRAINT "match_history_status" CHECK ("match_history"."status" in ('active','finalized','cancelled')),
	CONSTRAINT "match_history_result" CHECK ("match_history"."result" is null or "match_history"."result" in ('finished','draw','cancelled')),
	CONSTRAINT "match_history_reason" CHECK ("match_history"."reason" is null or "match_history"."reason" in ('checkmate','stalemate','total_timeout','turn_timeout','resignation','disconnect_timeout','agreement','both_disconnected','backend_restart','start_aborted')),
	CONSTRAINT "match_history_players" CHECK ("match_history"."red_account_id" <> "match_history"."black_account_id"),
	CONSTRAINT "match_history_winner" CHECK (("match_history"."result" = 'finished' and "match_history"."winner_account_id" is not null and "match_history"."winner_side" in ('red','black')) or ("match_history"."result" is distinct from 'finished' and "match_history"."winner_account_id" is null and "match_history"."winner_side" is null)),
	CONSTRAINT "match_history_times" CHECK ("match_history"."total_ms" > 0 and "match_history"."turn_ms" > 0 and "match_history"."wager_stake" >= 0 and "match_history"."move_count" >= 0 and "match_history"."finalization_version" > 0 and ("match_history"."ended_at" is null or ("match_history"."ended_at" >= "match_history"."started_at" and "match_history"."duration_ms" >= 0))),
	CONSTRAINT "match_history_terminal" CHECK (("match_history"."status" = 'active' and "match_history"."result" is null and "match_history"."ended_at" is null) or ("match_history"."status" <> 'active' and "match_history"."result" is not null and "match_history"."ended_at" is not null)),
	CONSTRAINT "match_history_detail" CHECK ("match_history"."detail_level" in ('full','partial')),
	CONSTRAINT "match_history_side_effect_status" CHECK ("match_history"."wager_status" in ('none','held','result_pending','settled','refunded') and "match_history"."reward_status" in ('pending','credited','not_eligible') and "match_history"."mission_status" in ('pending','recorded','applied'))
);
--> statement-breakpoint
CREATE TABLE "match_history_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"account_id" uuid,
	"side" text NOT NULL,
	"nickname_snapshot" text NOT NULL,
	"avatar_id_snapshot" text NOT NULL,
	"outcome" text,
	"captures" integer DEFAULT 0 NOT NULL,
	"cannon_captures" integer DEFAULT 0 NOT NULL,
	"successful_items_used" integer DEFAULT 0 NOT NULL,
	"used_item_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wager_net_delta" bigint DEFAULT 0 NOT NULL,
	"match_reward_amount" bigint DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_history_participants_side" CHECK ("match_history_participants"."side" in ('red','black')),
	CONSTRAINT "match_history_participants_outcome" CHECK ("match_history_participants"."outcome" is null or "match_history_participants"."outcome" in ('win','loss','draw','cancelled')),
	CONSTRAINT "match_history_participants_counts" CHECK ("match_history_participants"."captures" >= 0 and "match_history_participants"."cannon_captures" >= 0 and "match_history_participants"."cannon_captures" <= "match_history_participants"."captures" and "match_history_participants"."successful_items_used" >= 0 and "match_history_participants"."match_reward_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_red_account_id_accounts_id_fk" FOREIGN KEY ("red_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_black_account_id_accounts_id_fk" FOREIGN KEY ("black_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_winner_account_id_accounts_id_fk" FOREIGN KEY ("winner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_participants" ADD CONSTRAINT "match_history_participants_match_id_match_history_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_history"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_participants" ADD CONSTRAINT "match_history_participants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_history_red_ended_idx" ON "match_history" USING btree ("red_account_id","ended_at","match_id");--> statement-breakpoint
CREATE INDEX "match_history_black_ended_idx" ON "match_history" USING btree ("black_account_id","ended_at","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_history_participants_side_unique" ON "match_history_participants" USING btree ("match_id","side");--> statement-breakpoint
CREATE UNIQUE INDEX "match_history_participants_account_unique" ON "match_history_participants" USING btree ("match_id","account_id");--> statement-breakpoint
CREATE INDEX "match_history_participants_account_ended_idx" ON "match_history_participants" USING btree ("account_id","ended_at","match_id");
