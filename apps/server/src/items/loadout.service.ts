import { BadRequestException, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { inventoryItems, matchLoadouts } from "../db/schema";

@Injectable()
export class LoadoutService {
  constructor(private readonly database:DatabaseService) {}
  normalize(itemCodes:unknown):string[] {
    if(!Array.isArray(itemCodes)||itemCodes.length>3||itemCodes.some(code=>typeof code!=="string"||!/^[a-z][a-z0-9_]{1,63}$/.test(code)))
      throw new BadRequestException({code:"INVALID_LOADOUT"});
    if(new Set(itemCodes).size!==itemCodes.length)throw new BadRequestException({code:"DUPLICATE_LOADOUT_ITEM"});
    return [...itemCodes];
  }
  async validateOwnership(accountId:string,itemCodes:string[]):Promise<void> {
    if(!itemCodes.length)return;
    const rows=await this.database.db.select({itemCode:inventoryItems.itemCode,quantity:inventoryItems.quantity}).from(inventoryItems)
      .where(and(eq(inventoryItems.accountId,accountId),inArray(inventoryItems.itemCode,itemCodes)));
    if(rows.length!==itemCodes.length||rows.some(row=>row.quantity<1))throw new BadRequestException({code:"LOADOUT_ITEM_NOT_OWNED"});
  }
  async snapshot(matchId:string,selections:Array<{accountId:string;itemCodes:string[]}>):Promise<void> {
    await this.database.db.transaction(async tx=>{
      const existing=await tx.select().from(matchLoadouts).where(eq(matchLoadouts.matchId,matchId));
      if(existing.length){
        const expected=selections.flatMap(s=>s.itemCodes.map(itemCode=>`${s.accountId}:${itemCode}`)).sort();
        const actual=existing.map(row=>`${row.accountId}:${row.itemCode}`).sort();
        if(expected.join("|")!==actual.join("|"))throw new BadRequestException({code:"LOADOUT_SNAPSHOT_CONFLICT"});
        return;
      }
      for(const selection of selections){
        if(!selection.itemCodes.length)continue;
        const owned=await tx.select({itemCode:inventoryItems.itemCode,quantity:inventoryItems.quantity}).from(inventoryItems)
          .where(and(eq(inventoryItems.accountId,selection.accountId),inArray(inventoryItems.itemCode,selection.itemCodes))).for("update");
        if(owned.length!==selection.itemCodes.length||owned.some(row=>row.quantity<1))throw new BadRequestException({code:"LOADOUT_ITEM_NOT_OWNED"});
        await tx.insert(matchLoadouts).values(selection.itemCodes.map((itemCode,index)=>({matchId,accountId:selection.accountId,itemCode,slot:index+1})));
      }
    });
  }
  async snapshotForAccount(matchId:string,accountId:string) {
    return this.database.db.select({itemCode:matchLoadouts.itemCode,slot:matchLoadouts.slot}).from(matchLoadouts)
      .where(and(eq(matchLoadouts.matchId,matchId),eq(matchLoadouts.accountId,accountId))).orderBy(matchLoadouts.slot);
  }
  async discard(matchId:string):Promise<void> {
    await this.database.db.delete(matchLoadouts).where(eq(matchLoadouts.matchId,matchId));
  }
}
