import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../db/database.service";
import { inventoryItems, itemPurchases, shopItems } from "../db/schema";
import { MAX_GOLD, WalletService } from "../wallet/wallet.service";

export interface PurchaseInput { requestId:string; itemCode:string; quantity:number }

@Injectable()
export class ShopService {
  constructor(private readonly database:DatabaseService,private readonly wallet:WalletService) {}
  async purchase(accountId:string,input:PurchaseInput) {
    return this.database.db.transaction(async tx=>{
      const [wallet]=await this.wallet.lock(tx,[accountId]);
      if(!wallet)throw new NotFoundException({code:"WALLET_NOT_FOUND"});
      const [previous]=await tx.select().from(itemPurchases).where(and(eq(itemPurchases.accountId,accountId),eq(itemPurchases.requestId,input.requestId)));
      if(previous){
        if(previous.itemCode!==input.itemCode||previous.quantity!==input.quantity)throw new ConflictException({code:"IDEMPOTENCY_KEY_CONFLICT"});
        return this.result(previous);
      }
      const [item]=await tx.select().from(shopItems).where(eq(shopItems.code,input.itemCode));
      if(!item)throw new NotFoundException({code:"ITEM_NOT_FOUND"});
      if(!item.onSale)throw new ConflictException({code:"ITEM_NOT_FOR_SALE"});
      const totalPrice=item.priceGold*input.quantity;
      if(!Number.isSafeInteger(totalPrice)||totalPrice<0||totalPrice>MAX_GOLD)throw new BadRequestException({code:"PURCHASE_LIMIT"});
      if(wallet.availableGold<totalPrice)throw new ConflictException({code:"INSUFFICIENT_GOLD"});
      const [inventory]=await tx.insert(inventoryItems).values({accountId,itemCode:item.code,quantity:input.quantity})
        .onConflictDoUpdate({target:[inventoryItems.accountId,inventoryItems.itemCode],set:{quantity:sql`${inventoryItems.quantity} + ${input.quantity}`,updatedAt:new Date()}})
        .returning({quantity:inventoryItems.quantity});
      if(!inventory||!Number.isSafeInteger(inventory.quantity))throw new BadRequestException({code:"INVENTORY_LIMIT"});
      const id=randomUUID(),availableGoldAfter=wallet.availableGold-totalPrice;
      const [purchase]=await tx.insert(itemPurchases).values({id,accountId,requestId:input.requestId,itemCode:item.code,
        quantity:input.quantity,unitPrice:item.priceGold,totalPrice,inventoryQuantityAfter:inventory.quantity,availableGoldAfter}).returning();
      await this.wallet.purchase(tx,wallet,totalPrice,id,input.requestId);
      return this.result(purchase!);
    });
  }
  private result(row:typeof itemPurchases.$inferSelect) {
    return {requestId:row.requestId,itemCode:row.itemCode,quantity:row.quantity,unitPrice:row.unitPrice,
      totalPrice:row.totalPrice,inventoryQuantity:row.inventoryQuantityAfter,availableGold:row.availableGoldAfter,createdAt:row.createdAt};
  }
}
