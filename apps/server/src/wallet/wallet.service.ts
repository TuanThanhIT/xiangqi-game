import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { walletEntries, wallets } from "../db/schema";

export type WalletTx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
export const MAX_GOLD = Number.MAX_SAFE_INTEGER;
export function validGold(value:unknown):value is number {
  return typeof value==="number" && Number.isSafeInteger(value) && value>=0;
}
@Injectable()
export class WalletService {
  constructor(private readonly database:DatabaseService) {}
  async balance(accountId:string) {
    const [row]=await this.database.db.select().from(wallets).where(eq(wallets.accountId,accountId));
    if(!row)throw new NotFoundException({code:"WALLET_NOT_FOUND"});
    return {availableGold:row.availableGold,heldGold:row.heldGold,totalGold:row.availableGold+row.heldGold,version:row.version};
  }
  async history(accountId:string,before?:number,limit=20) {
    const rows=await this.database.db.select().from(walletEntries).where(and(eq(walletEntries.accountId,accountId),
      before===undefined?undefined:lt(walletEntries.entryNo,before))).orderBy(desc(walletEntries.entryNo)).limit(limit+1);
    const items=rows.slice(0,limit).map(({accountId:_accountId,operationKey:_operationKey,...entry})=>entry);
    return {items,nextCursor:rows.length>limit?items.at(-1)!.entryNo:null};
  }
  async lock(tx:WalletTx,accountIds:string[]) {
    // Sorting makes two-match transactions acquire wallet locks in the same order.
    return tx.select().from(wallets).where(inArray(wallets.accountId,accountIds)).orderBy(wallets.accountId).for("update");
  }
  async change(tx:WalletTx,row:typeof wallets.$inferSelect,availableDelta:number,heldDelta:number,
    reason:"bet_hold"|"bet_refund"|"bet_payout",matchId:string) {
    const availableGold=row.availableGold+availableDelta,heldGold=row.heldGold+heldDelta;
    if(!validGold(availableGold)||!validGold(heldGold)||!validGold(availableGold+heldGold))throw new BadRequestException({code:"WALLET_LIMIT"});
    const version=row.version+1;
    await tx.update(wallets).set({availableGold,heldGold,version}).where(eq(wallets.accountId,row.accountId));
    await tx.insert(walletEntries).values({accountId:row.accountId,entryNo:version,operationKey:`${matchId}:${reason}`,
      reason,matchId,availableDelta,heldDelta,availableAfter:availableGold,heldAfter:heldGold});
  }
  async purchase(tx:WalletTx,row:typeof wallets.$inferSelect,amount:number,purchaseId:string,requestId:string) {
    const availableGold=row.availableGold-amount,heldGold=row.heldGold;
    if(!validGold(amount)||!validGold(availableGold))throw new BadRequestException({code:"INSUFFICIENT_GOLD"});
    const version=row.version+1;
    await tx.update(wallets).set({availableGold,version}).where(eq(wallets.accountId,row.accountId));
    await tx.insert(walletEntries).values({accountId:row.accountId,entryNo:version,
      operationKey:`purchase:${requestId}`,reason:"item_purchase",purchaseId,
      availableDelta:-amount,heldDelta:0,availableAfter:availableGold,heldAfter:heldGold});
    return {availableGold,heldGold,version};
  }
}
