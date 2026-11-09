import { Injectable } from "@nestjs/common";
import { asc } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { shopItems } from "../db/schema";

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}
  async list() {
    return this.database.db.select({code:shopItems.code,name:shopItems.name,description:shopItems.description,
      group:shopItems.groupCode,priceGold:shopItems.priceGold,onSale:shopItems.onSale,
      displayOrder:shopItems.displayOrder,version:shopItems.version,metadata:shopItems.metadata})
      .from(shopItems).orderBy(asc(shopItems.displayOrder));
  }
}
