import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { dailyCheckIns, walletEntries, wallets } from "../db/schema";
import { MAX_GOLD, validGold, WalletService } from "../wallet/wallet.service";

export const CHECK_IN_TIMEZONE="Asia/Ho_Chi_Minh";
export const CHECK_IN_CYCLE_VERSION="daily_check_in_v1";
export const CHECK_IN_MILESTONES=[{cycleDay:7,reward:50},{cycleDay:14,reward:50},{cycleDay:21,reward:50},{cycleDay:28,reward:50},{cycleDay:30,reward:200}] as const;
const DAY_MS=86_400_000,VIETNAM_OFFSET_MS=7*3_600_000;
export interface CheckInClock {now():Date}

export function vietnamDate(now:Date):string {return new Date(now.getTime()+VIETNAM_OFFSET_MS).toISOString().slice(0,10);}
export function nextVietnamReset(localDate:string):Date {return new Date(Date.parse(`${localDate}T00:00:00.000Z`)+DAY_MS-VIETNAM_OFFSET_MS);}
const dayDistance=(from:string,to:string)=>(Date.parse(`${to}T00:00:00.000Z`)-Date.parse(`${from}T00:00:00.000Z`))/DAY_MS;
function rewards(cycleDay:number){const weeklyBonus=[7,14,21,28].includes(cycleDay)?50:0,monthlyBonus=cycleDay===30?200:0;return {dailyReward:20,weeklyBonus,monthlyBonus,totalReward:20+weeklyBonus+monthlyBonus};}

@Injectable()
export class CheckInService {
  readonly clock:CheckInClock={now:()=>new Date()};
  constructor(private readonly database:DatabaseService,private readonly wallet:WalletService) {}

  private response(row:typeof dailyCheckIns.$inferSelect){return {checkInId:row.id,localDate:row.localDate,cycleDay:row.cycleDay,
    consecutiveDays:row.consecutiveDays,dailyReward:row.dailyReward,weeklyBonus:row.weeklyBonus,monthlyBonus:row.monthlyBonus,
    totalReward:row.totalReward,walletBalance:row.walletAvailableAfter,claimedAt:row.claimedAt.toISOString(),nextResetAt:nextVietnamReset(row.localDate).toISOString()};}

  async status(accountId:string){const now=this.clock.now(),localDate=vietnamDate(now);
    const [today]=await this.database.db.select().from(dailyCheckIns).where(and(eq(dailyCheckIns.accountId,accountId),eq(dailyCheckIns.localDate,localDate))).limit(1);
    const [last]=today?[today]:await this.database.db.select().from(dailyCheckIns).where(eq(dailyCheckIns.accountId,accountId)).orderBy(desc(dailyCheckIns.localDate)).limit(1);
    const consecutive=last?.consecutiveDays??0,current=last?.cycleDay??0;
    const next=!last||dayDistance(last.localDate,localDate)>1?1:today?current:current===30?1:current+1;
    return {serverDate:localDate,timezone:CHECK_IN_TIMEZONE,claimedToday:!!today,canClaim:!today,currentCycleDay:current,nextCycleDay:next,
      consecutiveDays:consecutive,lastClaimedDate:last?.localDate??null,nextResetAt:nextVietnamReset(localDate).toISOString(),milestones:CHECK_IN_MILESTONES,
      todayClaim:today?this.response(today):null};}

  async claim(accountId:string){const claimedAt=this.clock.now(),localDate=vietnamDate(claimedAt);
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}, 6062026))`);
      const [existing]=await tx.select().from(dailyCheckIns).where(and(eq(dailyCheckIns.accountId,accountId),eq(dailyCheckIns.localDate,localDate))).limit(1);
      if(existing)return this.response(existing);
      const [last]=await tx.select().from(dailyCheckIns).where(eq(dailyCheckIns.accountId,accountId)).orderBy(desc(dailyCheckIns.localDate)).limit(1);
      const consecutive=last&&dayDistance(last.localDate,localDate)===1?last.consecutiveDays+1:1;
      const cycleDay=last&&dayDistance(last.localDate,localDate)===1?(last.cycleDay===30?1:last.cycleDay+1):1;
      const parts=rewards(cycleDay),[balance]=await this.wallet.lock(tx,[accountId]);
      if(!balance)throw new BadRequestException({code:"WALLET_NOT_FOUND"});
      const availableGold=balance.availableGold+parts.totalReward,entryCount=parts.totalReward===20?1:2,finalVersion=balance.version+entryCount;
      if(!validGold(availableGold)||availableGold>MAX_GOLD)throw new BadRequestException({code:"WALLET_LIMIT"});
      const id=crypto.randomUUID(),dailyEntryNo=balance.version+1,milestoneEntryNo=entryCount===2?finalVersion:null;
      const [row]=await tx.insert(dailyCheckIns).values({id,accountId,localDate,cycleDay,consecutiveDays:consecutive,...parts,walletAvailableAfter:availableGold,
        dailyEntryNo,milestoneEntryNo,claimedAt}).returning();
      const metadata={localDate,cycleDay,cycleVersion:CHECK_IN_CYCLE_VERSION};
      await tx.update(wallets).set({availableGold,version:finalVersion}).where(eq(wallets.accountId,accountId));
      await tx.insert(walletEntries).values({accountId,entryNo:dailyEntryNo,operationKey:`daily_check_in_v1:${accountId}:${localDate}:daily`,reason:"daily_check_in_reward",checkInId:id,
        metadata:{...metadata,rewardType:"daily"},availableDelta:20,heldDelta:0,availableAfter:balance.availableGold+20,heldAfter:balance.heldGold});
      if(milestoneEntryNo){const weekly=parts.weeklyBonus>0;
        await tx.insert(walletEntries).values({accountId,entryNo:milestoneEntryNo,operationKey:`daily_check_in_v1:${accountId}:${localDate}:milestone`,
          reason:weekly?"check_in_7_day_bonus":"check_in_30_day_bonus",checkInId:id,metadata:{...metadata,rewardType:weekly?"weekly":"cycle"},
          availableDelta:weekly?parts.weeklyBonus:parts.monthlyBonus,heldDelta:0,availableAfter:availableGold,heldAfter:balance.heldGold});}
      return this.response(row);
    });}
}
