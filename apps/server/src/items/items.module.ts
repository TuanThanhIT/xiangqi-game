import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { WalletModule } from "../wallet/wallet.module";
import { CatalogService } from "./catalog.service";
import { InventoryService } from "./inventory.service";
import { ItemsController } from "./items.controller";
import { LoadoutService } from "./loadout.service";
import { ShopService } from "./shop.service";

@Module({imports:[DatabaseModule,AuthModule,WalletModule],controllers:[ItemsController],
  providers:[CatalogService,InventoryService,ShopService,LoadoutService],exports:[LoadoutService]})
export class ItemsModule {}
