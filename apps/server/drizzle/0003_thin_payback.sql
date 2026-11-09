CREATE TABLE "inventory_items" (
	"account_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_account_id_item_code_pk" PRIMARY KEY("account_id","item_code"),
	CONSTRAINT "inventory_items_quantity" CHECK ("inventory_items"."quantity" >= 0 and "inventory_items"."quantity" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "inventory_starter_grants" (
	"account_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"quantity" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_starter_grants_account_id_item_code_pk" PRIMARY KEY("account_id","item_code"),
	CONSTRAINT "inventory_starter_grants_quantity" CHECK ("inventory_starter_grants"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "item_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"total_price" bigint NOT NULL,
	"inventory_quantity_after" bigint NOT NULL,
	"available_gold_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_purchases_quantity" CHECK ("item_purchases"."quantity" between 1 and 99),
	CONSTRAINT "item_purchases_amounts" CHECK ("item_purchases"."unit_price" >= 0 and "item_purchases"."total_price" = "item_purchases"."unit_price" * "item_purchases"."quantity" and "item_purchases"."inventory_quantity_after" >= 0 and "item_purchases"."available_gold_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_loadouts" (
	"match_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_loadouts_match_id_account_id_item_code_pk" PRIMARY KEY("match_id","account_id","item_code"),
	CONSTRAINT "match_loadouts_slot" CHECK ("match_loadouts"."slot" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"group_code" text NOT NULL,
	"price_gold" bigint NOT NULL,
	"on_sale" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starter_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_items_code" CHECK ("shop_items"."code" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "shop_items_price" CHECK ("shop_items"."price_gold" >= 0 and "shop_items"."price_gold" <= 9007199254740991),
	CONSTRAINT "shop_items_order_version" CHECK ("shop_items"."display_order" > 0 and "shop_items"."version" > 0 and "shop_items"."starter_quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_match";--> statement-breakpoint
ALTER TABLE "wallet_entries" DROP CONSTRAINT "wallet_entries_reason";--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_starter_grants" ADD CONSTRAINT "inventory_starter_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_starter_grants" ADD CONSTRAINT "inventory_starter_grants_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_purchases" ADD CONSTRAINT "item_purchases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_purchases" ADD CONSTRAINT "item_purchases_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_loadouts" ADD CONSTRAINT "match_loadouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_loadouts" ADD CONSTRAINT "match_loadouts_item_code_shop_items_code_fk" FOREIGN KEY ("item_code") REFERENCES "public"."shop_items"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_purchases_request_unique" ON "item_purchases" USING btree ("account_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_loadouts_slot_unique" ON "match_loadouts" USING btree ("match_id","account_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_items_display_order_unique" ON "shop_items" USING btree ("display_order");--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_purchase_id_item_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."item_purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reference" CHECK (("wallet_entries"."reason" = 'starter_grant' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is null) or ("wallet_entries"."reason" in ('bet_hold','bet_refund','bet_payout') and "wallet_entries"."match_id" is not null and "wallet_entries"."purchase_id" is null) or ("wallet_entries"."reason" = 'item_purchase' and "wallet_entries"."match_id" is null and "wallet_entries"."purchase_id" is not null));--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_reason" CHECK ("wallet_entries"."reason" in ('starter_grant','bet_hold','bet_refund','bet_payout','item_purchase'));
--> statement-breakpoint
INSERT INTO "shop_items" ("code","name","description","group_code","price_gold","on_sale","display_order","version","metadata","starter_quantity") VALUES
('scout','Trinh sát','Xem các đích hợp lệ của một quân đối thủ theo thế hiện tại nếu đến lượt họ.','information',30,true,1,1,'{"effectCode":"scout"}',1),
('time_saver','Tiết kiệm thời gian','Hoàn thời gian đã dùng nếu server chấp nhận nước đi trong 10 giây thi đấu sau kích hoạt.','time_refund',40,true,2,1,'{"effectCode":"time_saver"}',1),
('unseal','Phá ấn','Gỡ Phong ấn khỏi một quân mình để quân đó có thể đi ngay trong lượt.','dispel_seal',50,true,3,1,'{"effectCode":"unseal"}',1),
('shield_breaker','Phá khiên','Gỡ Khiên của một quân đối thủ.','dispel_shield',50,true,4,1,'{"effectCode":"shield_breaker"}',1),
('time_pressure','Thời áp','Trừ tối đa 15 giây tổng của đối thủ, chừa ít nhất 10 giây.','time_attack',60,true,5,1,'{"effectCode":"time_pressure"}',1),
('time_extension','Gia hạn','Cộng 30 giây vào quỹ tổng của mình.','time_total',70,true,6,1,'{"effectCode":"time_extension"}',1),
('calm','Tĩnh tâm','Cộng 15 giây vào đồng hồ lượt hiện tại của mình.','time_turn',80,true,7,1,'{"effectCode":"calm"}',1),
('shield','Khiên','Bảo vệ một quân mình, trừ Tướng, khỏi bị ăn suốt lượt kế tiếp của đối thủ.','protection',100,true,8,1,'{"effectCode":"shield"}',1),
('seal','Phong ấn','Khóa di chuyển một quân đối thủ, trừ Tướng, trong lượt kế tiếp của họ.','control',130,true,9,1,'{"effectCode":"seal"}',1),
('revive','Hồi sinh','Đưa một quân mình đã mất, trừ Tướng, về đúng giao điểm ban đầu của chính quân đó.','revival',180,true,10,1,'{"effectCode":"revive"}',1);
--> statement-breakpoint
CREATE FUNCTION grant_inventory_starter(target_id uuid) RETURNS void
LANGUAGE sql SET search_path FROM CURRENT AS $$
  WITH granted AS (
    INSERT INTO inventory_starter_grants (account_id,item_code,quantity)
    SELECT target_id, item.code, item.starter_quantity
    FROM shop_items item
    WHERE item.starter_quantity > 0
      AND EXISTS (SELECT 1 FROM accounts account WHERE account.id=target_id AND account.email_verified_at IS NOT NULL)
    ON CONFLICT (account_id,item_code) DO NOTHING
    RETURNING account_id,item_code,quantity
  )
  INSERT INTO inventory_items (account_id,item_code,quantity)
  SELECT account_id,item_code,quantity FROM granted
  ON CONFLICT (account_id,item_code) DO UPDATE
  SET quantity=inventory_items.quantity+EXCLUDED.quantity,updated_at=now();
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION grant_wallet_on_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM grant_wallet_starter(NEW.id);
  PERFORM grant_inventory_starter(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
SELECT grant_inventory_starter(id) FROM accounts WHERE email_verified_at IS NOT NULL;
