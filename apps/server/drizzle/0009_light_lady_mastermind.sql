CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"account_low_id" uuid NOT NULL,
	"account_high_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "friend_requests_accounts" CHECK ("friend_requests"."sender_account_id" <> "friend_requests"."recipient_account_id" and "friend_requests"."account_low_id"::text < "friend_requests"."account_high_id"::text and "friend_requests"."sender_account_id" in ("friend_requests"."account_low_id","friend_requests"."account_high_id") and "friend_requests"."recipient_account_id" in ("friend_requests"."account_low_id","friend_requests"."account_high_id")),
	CONSTRAINT "friend_requests_status" CHECK ("friend_requests"."status" in ('pending','accepted','rejected','cancelled','invalidated')),
	CONSTRAINT "friend_requests_resolution" CHECK (("friend_requests"."status" = 'pending' and "friend_requests"."resolved_at" is null) or ("friend_requests"."status" <> 'pending' and "friend_requests"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_low_id" uuid NOT NULL,
	"account_high_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_canonical_pair" CHECK ("friendships"."account_low_id"::text < "friendships"."account_high_id"::text)
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_account_id" uuid NOT NULL,
	"blocked_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_account_id_blocked_account_id_pk" PRIMARY KEY("blocker_account_id","blocked_account_id"),
	CONSTRAINT "user_blocks_accounts" CHECK ("user_blocks"."blocker_account_id" <> "user_blocks"."blocked_account_id")
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_account_id_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_account_id_accounts_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_account_low_id_accounts_id_fk" FOREIGN KEY ("account_low_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_account_high_id_accounts_id_fk" FOREIGN KEY ("account_high_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_account_low_id_accounts_id_fk" FOREIGN KEY ("account_low_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_account_high_id_accounts_id_fk" FOREIGN KEY ("account_high_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_account_id_accounts_id_fk" FOREIGN KEY ("blocker_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_account_id_accounts_id_fk" FOREIGN KEY ("blocked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_pair_unique" ON "friend_requests" USING btree ("account_low_id","account_high_id") WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_sender_created_idx" ON "friend_requests" USING btree ("sender_account_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_status_created_idx" ON "friend_requests" USING btree ("recipient_account_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree ("account_low_id","account_high_id");--> statement-breakpoint
CREATE INDEX "friendships_low_idx" ON "friendships" USING btree ("account_low_id","accepted_at");--> statement-breakpoint
CREATE INDEX "friendships_high_idx" ON "friendships" USING btree ("account_high_id","accepted_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_account_id");