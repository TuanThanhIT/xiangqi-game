import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { inventoryItems, shopItems } from "../db/schema";

@Injectable()
export class InventoryService {
  constructor(private readonly database: DatabaseService) {}
  async list(accountId:string) {
    return this.database.db.select({code:shopItems.code,name:shopItems.name,description:shopItems.description,
      group:shopItems.groupCode,quantity:inventoryItems.quantity,displayOrder:shopItems.displayOrder,
      version:shopItems.version,metadata:shopItems.metadata})
      .from(inventoryItems).innerJoin(shopItems,eq(shopItems.code,inventoryItems.itemCode))
      .where(eq(inventoryItems.accountId,accountId)).orderBy(asc(shopItems.displayOrder));
  }
}
