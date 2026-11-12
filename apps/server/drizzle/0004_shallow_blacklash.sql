CREATE TABLE "item_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"item_code" text NOT NULL,
	"target_piece_id" text,
	"status" text DEFAULT 'committed' NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL,
	"quantity_consumed" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_usages_committed" CHECK ("item_usages"."status" = 'committed' and "item_usages"."quantity_consumed" = 1)
);
--> statement-breakpoint
ALTER TABLE "item_usages" ADD CONSTRAINT "item_usages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_usages" ADD CONSTRAINT "item_usages_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_usages_request_unique" ON "item_usages" USING btree ("match_id","account_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_usages_loadout_unique" ON "item_usages" USING btree ("match_id","account_id","item_code");