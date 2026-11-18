import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { itemPurchases, shopItems, walletEntries, wallets } from "../db/schema";

export const walletEntryTypes=["starter_grant","bet_hold","bet_refund","bet_payout","item_purchase","casual_match_win_reward","daily_check_in_reward","check_in_7_day_bonus","check_in_30_day_bonus","mission_reward"] as const;
export type WalletEntryType=typeof walletEntryTypes[number];
export type WalletCategory="wager"|"purchase"|"reward"|"grant";
export interface WalletHistoryQuery {before?:number;limit:number;category?:WalletCategory;type?:WalletEntryType;from?:string;to?:string}
const categories:Record<WalletCategory,WalletEntryType[]>={wager:["bet_hold","bet_refund","bet_payout"],purchase:["item_purchase"],reward:["casual_match_win_reward","daily_check_in_reward","check_in_7_day_bonus","check_in_30_day_bonus","mission_reward"],grant:["starter_grant"]};
const OFFSET=7*3_600_000,DAY=86_400_000;
const boundary=(date:string)=>new Date(Date.parse(`${date}T00:00:00Z`)-OFFSET);

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
  async history(accountId:string,query:WalletHistoryQuery|number|undefined,legacyLimit=20) {
    const q:WalletHistoryQuery=typeof query==="object"&&query!==null?query:{before:query,limit:legacyLimit};
    const reasons=q.type?[q.type]:q.category?categories[q.category]:undefined;
    const rows=await this.database.db.select().from(walletEntries).where(and(eq(walletEntries.accountId,accountId),
      q.before===undefined?undefined:lt(walletEntries.entryNo,q.before),reasons?inArray(walletEntries.reason,reasons):undefined,
      q.from?gte(walletEntries.createdAt,boundary(q.from)):undefined,q.to?lt(walletEntries.createdAt,new Date(boundary(q.to).getTime()+DAY)):undefined)).orderBy(desc(walletEntries.entryNo)).limit(q.limit+1);
    const page=rows.slice(0,q.limit),purchaseIds=page.flatMap(row=>row.purchaseId?[row.purchaseId]:[]),purchases=purchaseIds.length?await this.database.db.select({purchase:itemPurchases,itemName:shopItems.name}).from(itemPurchases).innerJoin(shopItems,eq(shopItems.code,itemPurchases.itemCode)).where(inArray(itemPurchases.id,purchaseIds)):[];
    const items=page.map(row=>this.historyDto(row,purchases.find(x=>x.purchase.id===row.purchaseId)));
    return {items,nextCursor:rows.length>q.limit?items.at(-1)!.entryNo:null};
  }
  private historyDto(row:typeof walletEntries.$inferSelect,purchase?:{purchase:typeof itemPurchases.$inferSelect;itemName:string}) {
    const type=row.reason as WalletEntryType,category=(Object.entries(categories).find(([,values])=>values.includes(type))?.[0]??"reward") as WalletCategory;
    const netAmount=row.availableDelta+row.heldDelta;
    const direction=type==="bet_hold"||type==="bet_refund"?"transfer":netAmount>0?"credit":netAmount<0?"debit":"transfer";
    const reference=row.matchId||row.rewardMatchId?{kind:"match",id:row.matchId??row.rewardMatchId!}:row.purchaseId?{kind:"purchase",id:row.purchaseId}:row.checkInId?{kind:"check_in",id:row.checkInId}:row.missionProgressId?{kind:"mission",id:row.missionProgressId}:null;
    let details:Record<string,unknown>={};
    if(type==="bet_hold")details={stake:row.heldDelta};
    else if(type==="bet_refund")details={releasedStake:-row.heldDelta};
    else if(type==="bet_payout"){const stake=-row.heldDelta;details=row.availableDelta>0?{stake,grossPayout:row.availableDelta,netProfit:netAmount}:{stake,netLoss:-netAmount};}
    else if(type==="item_purchase"&&purchase)details={itemCode:purchase.purchase.itemCode,itemName:purchase.itemName,quantity:purchase.purchase.quantity,unitPrice:purchase.purchase.unitPrice,totalPrice:purchase.purchase.totalPrice};
    else if(["daily_check_in_reward","check_in_7_day_bonus","check_in_30_day_bonus"].includes(type))details={localDate:row.metadata.localDate,cycleDay:row.metadata.cycleDay,rewardType:row.metadata.rewardType};
    else if(type==="mission_reward")details={missionCode:row.metadata.missionCode,category:row.metadata.category,periodKey:row.metadata.periodKey,amount:row.metadata.rewardAmount};
    return {id:`${row.entryNo}`,entryNo:row.entryNo,type,category,availableDelta:row.availableDelta,heldDelta:row.heldDelta,netAmount,direction,
      availableBalanceAfter:row.availableAfter,heldBalanceAfter:row.heldAfter,titleCode:`wallet.${type}.title`,descriptionCode:`wallet.${type}.description`,occurredAt:row.createdAt.toISOString(),reference,details};
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
