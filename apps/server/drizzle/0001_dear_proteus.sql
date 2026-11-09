CREATE TABLE "auth_email_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"digest" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "email_otps_purpose" CHECK ("auth_email_otps"."purpose" in ('email_verification', 'password_reset')),
	CONSTRAINT "email_otps_attempts" CHECK ("auth_email_otps"."failed_attempts" between 0 and 5),
	CONSTRAINT "email_otps_expiry" CHECK ("auth_email_otps"."expires_at" > "auth_email_otps"."sent_at")
);
--> statement-breakpoint
CREATE TABLE "auth_email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_key" text NOT NULL,
	"purpose" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text NOT NULL,
	CONSTRAINT "email_sends_purpose" CHECK ("auth_email_sends"."purpose" in ('email_verification', 'password_reset')),
	CONSTRAINT "email_sends_status" CHECK ("auth_email_sends"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "auth_email_otps" ADD CONSTRAINT "auth_email_otps_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_otps_one_active" ON "auth_email_otps" USING btree ("account_id","purpose") WHERE "auth_email_otps"."consumed_at" is null and "auth_email_otps"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "email_sends_quota_idx" ON "auth_email_sends" USING btree ("email_key","attempted_at");