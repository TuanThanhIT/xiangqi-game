import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { AuthRequest } from "../auth/guards/auth.guard";
import { AuthOriginGuard } from "../auth/guards/origin.guard";
import { CatalogService } from "./catalog.service";
import { InventoryService } from "./inventory.service";
import { PurchasePipe } from "./items.pipe";
import { ShopService, type PurchaseInput } from "./shop.service";

@Controller()
@UseGuards(AuthGuard)
export class ItemsController {
  constructor(private readonly catalog:CatalogService,private readonly inventory:InventoryService,private readonly shop:ShopService) {}
  @Get("shop/items") @Header("Cache-Control","no-store") catalogItems(){return this.catalog.list();}
  @Get("inventory") @Header("Cache-Control","no-store") ownInventory(@Req() request:AuthRequest){return this.inventory.list(request.profile!.id);}
  @Post("shop/purchases") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control","no-store")
  purchase(@Req() request:AuthRequest,@Body(PurchasePipe) body:PurchaseInput){return this.shop.purchase(request.profile!.id,body);}
}
