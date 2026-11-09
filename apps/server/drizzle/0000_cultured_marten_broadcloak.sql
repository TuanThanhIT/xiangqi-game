CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_key" text GENERATED ALWAYS AS (lower(btrim(email))) STORED NOT NULL,
	"nickname" text NOT NULL,
	"nickname_key" text GENERATED ALWAYS AS (lower(btrim(regexp_replace(nickname, '[[:space:]]+', ' ', 'g')))) STORED NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_id" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_verified_at" timestamp with time zone,
	"pending_expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"nickname_changed_at" timestamp with time zone,
	CONSTRAINT "accounts_email_key_unique" UNIQUE("email_key"),
	CONSTRAINT "accounts_nickname_key_unique" UNIQUE("nickname_key"),
	CONSTRAINT "accounts_email_nonempty" CHECK (length("accounts"."email_key") > 0),
	CONSTRAINT "accounts_nickname_nonempty" CHECK (length("accounts"."nickname_key") > 0)
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"asset_path" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash"),
	CONSTRAINT "sessions_expiry" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_account_id_idx" ON "sessions" USING btree ("account_id");
--> statement-breakpoint
INSERT INTO "avatars" ("id", "name") VALUES ('default', 'Mặc định');
