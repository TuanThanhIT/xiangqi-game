import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { missionContributions, missionDefinitions, missionProgress, walletEntries, wallets } from "../db/schema";
import { nextVietnamReset, vietnamDate } from "../check-in/check-in.service";
import { MAX_GOLD, validGold, WalletService } from "../wallet/wallet.service";
import { MISSION_CONTRIBUTION_VERSION, MISSION_TIMEZONE, type MissionCategory, type MissionMetric } from "./mission-catalog";

const DAY_MS=86_400_000,VIETNAM_OFFSET_MS=7*3_600_000,LIFETIME="lifetime";
export interface MissionClock {now():Date}
export interface ContributionSummary {accountId:string;completedMatches:number;wins:number;captures:number;cannonCaptures:number;itemUsages:number;wonWithoutItem:number}
export interface MissionMatchInput {matchId:string;resultStatus:string;reason:string;resultAt:Date;contributions:ContributionSummary[]}

export function weeklyPeriodKey(date:string):string {
  const value=new Date(`${date}T00:00:00.000Z`),offset=(value.getUTCDay()+6)%7;
  return new Date(value.getTime()-offset*DAY_MS).toISOString().slice(0,10);
}
export function missionPeriod(category:MissionCategory,now:Date):string {
  const date=vietnamDate(now);return category==="daily"?date:category==="weekly"?weeklyPeriodKey(date):LIFETIME;
}
export function nextWeeklyReset(now:Date):Date {
  const monday=weeklyPeriodKey(vietnamDate(now));return new Date(Date.parse(`${monday}T00:00:00.000Z`)+7*DAY_MS-VIETNAM_OFFSET_MS);
}
const contributionValue=(row:ContributionSummary,metric:MissionMetric):number=>({completed_matches:row.completedMatches,wins:row.wins,
  captures:row.captures,cannon_captures:row.cannonCaptures,item_usages:row.itemUsages,win_without_item:row.wonWithoutItem})[metric];

@Injectable()
export class MissionService {
  readonly clock:MissionClock={now:()=>new Date()};
  constructor(private readonly database:DatabaseService,private readonly wallet:WalletService){}

  async record(input:MissionMatchInput):Promise<void>{
    if(input.contributions.length!==2||new Set(input.contributions.map(x=>x.accountId)).size!==2)throw new ConflictException({code:"mission_contribution_conflict"});
    await this.database.db.transaction(async tx=>{
      for(const value of input.contributions)await tx.insert(missionContributions).values({...value,matchId:input.matchId,
        version:MISSION_CONTRIBUTION_VERSION,resultStatus:input.resultStatus,reason:input.reason,resultAt:input.resultAt}).onConflictDoNothing();
      const rows=await tx.select().from(missionContributions).where(and(eq(missionContributions.matchId,input.matchId),eq(missionContributions.version,MISSION_CONTRIBUTION_VERSION)));
      if(rows.length!==2)throw new ConflictException({code:"mission_contribution_conflict"});
      for(const value of input.contributions){const row=rows.find(x=>x.accountId===value.accountId);
        if(!row||row.resultStatus!==input.resultStatus||row.reason!==input.reason||row.resultAt.getTime()!==input.resultAt.getTime()||
          ["completedMatches","wins","captures","cannonCaptures","itemUsages","wonWithoutItem"].some(k=>row[k as keyof typeof row]!==value[k as keyof typeof value]))
          throw new ConflictException({code:"mission_contribution_conflict"});}
    });
  }

  async apply(matchId:string):Promise<void>{
    await this.database.db.transaction(async tx=>{
      const rows=await tx.select().from(missionContributions).where(and(eq(missionContributions.matchId,matchId),eq(missionContributions.version,MISSION_CONTRIBUTION_VERSION))).for("update");
      if(rows.length!==2)throw new ConflictException({code:"mission_contribution_missing"});
      if(rows.every(row=>row.appliedAt))return;
      if(rows.some(row=>row.appliedAt))throw new ConflictException({code:"mission_contribution_conflict"});
      const definitions=await tx.select().from(missionDefinitions).where(eq(missionDefinitions.active,true)).orderBy(asc(missionDefinitions.displayOrder));
      const appliedAt=this.clock.now();
      for(const row of [...rows].sort((a,b)=>a.accountId.localeCompare(b.accountId))){
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${row.accountId}, 7072026))`);
        const summary:ContributionSummary=row;
        for(const definition of definitions){const delta=contributionValue(summary,definition.metric as MissionMetric);if(delta<=0)continue;
          const periodKey=missionPeriod(definition.category as MissionCategory,row.resultAt);
          const [existing]=await tx.select().from(missionProgress).where(and(eq(missionProgress.accountId,row.accountId),eq(missionProgress.missionCode,definition.code),eq(missionProgress.periodKey,periodKey))).for("update");
          if(!existing){const completed=delta>=definition.target;
            await tx.insert(missionProgress).values({accountId:row.accountId,missionCode:definition.code,periodKey,progress:delta,
              targetSnapshot:definition.target,rewardGoldSnapshot:definition.rewardGold,definitionVersion:definition.version,
              status:completed?"completed":"in_progress",completedAt:completed?row.resultAt:null,updatedAt:appliedAt});
          }else if(existing.status==="in_progress"){
            const progress=existing.progress+delta,completed=progress>=existing.targetSnapshot;
            await tx.update(missionProgress).set({progress,status:completed?"completed":"in_progress",
              completedAt:completed?row.resultAt:null,updatedAt:appliedAt}).where(eq(missionProgress.id,existing.id));
          }
        }
      }
      await tx.update(missionContributions).set({appliedAt}).where(and(eq(missionContributions.matchId,matchId),eq(missionContributions.version,MISSION_CONTRIBUTION_VERSION)));
    });
  }

  async finish(input:MissionMatchInput):Promise<void>{await this.record(input);await this.apply(input.matchId);}
  async recover():Promise<number>{const pending=await this.database.db.selectDistinct({matchId:missionContributions.matchId}).from(missionContributions).where(isNull(missionContributions.appliedAt));
    for(const row of pending)await this.apply(row.matchId);return pending.length;}

  private async expire(accountId:string,now:Date,tx:Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0]):Promise<void>{
    const daily=vietnamDate(now),weekly=weeklyPeriodKey(daily);
    await tx.execute(sql`update mission_progress p set status='expired', updated_at=${now}
      from mission_definitions d where p.mission_code=d.code and p.account_id=${accountId}
      and p.status in ('in_progress','completed') and ((d.category='daily' and p.period_key<>${daily}) or (d.category='weekly' and p.period_key<>${weekly}))`);
  }

  async list(accountId:string,category:MissionCategory|"all"="all"){
    const now=this.clock.now(),categories=category==="all"?["daily","weekly","achievement"]: [category];
    const {definitions,rows}=await this.database.db.transaction(async tx=>{await this.expire(accountId,now,tx);
      return {definitions:await tx.select().from(missionDefinitions).where(and(eq(missionDefinitions.active,true),inArray(missionDefinitions.category,categories))).orderBy(asc(missionDefinitions.category),asc(missionDefinitions.displayOrder)),
        rows:await tx.select().from(missionProgress).where(and(eq(missionProgress.accountId,accountId),inArray(missionProgress.periodKey,[vietnamDate(now),weeklyPeriodKey(vietnamDate(now)),LIFETIME])))};});
    return {serverTime:now.toISOString(),timezone:MISSION_TIMEZONE,dailyResetAt:nextVietnamReset(vietnamDate(now)).toISOString(),weeklyResetAt:nextWeeklyReset(now).toISOString(),
      missions:definitions.map(definition=>{const periodKey=missionPeriod(definition.category as MissionCategory,now),row=rows.find(x=>x.missionCode===definition.code&&x.periodKey===periodKey);
        const status=row?.status??"in_progress",progress=Math.min(row?.progress??0,definition.target);return {code:definition.code,category:definition.category,title:definition.title,
          description:definition.description,progress,target:definition.target,rewardGold:definition.rewardGold,status,canClaim:status==="completed",
          completedAt:row?.completedAt?.toISOString()??null,claimedAt:row?.claimedAt?.toISOString()??null,periodKey};})};
  }

  async claim(accountId:string,code:string){const now=this.clock.now();
    return this.database.db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}, 7072026))`);
      await this.expire(accountId,now,tx);
      const [definition]=await tx.select().from(missionDefinitions).where(eq(missionDefinitions.code,code));
      if(!definition)throw new NotFoundException({code:"mission_not_found"});
      if(!definition.active)throw new ConflictException({code:"mission_inactive"});
      const category=definition.category as MissionCategory,periodKey=missionPeriod(category,now);
      const [progress]=await tx.select().from(missionProgress).where(and(eq(missionProgress.accountId,accountId),eq(missionProgress.missionCode,code),eq(missionProgress.periodKey,periodKey))).for("update");
      if(!progress){
        const [old]=await tx.select().from(missionProgress).where(and(eq(missionProgress.accountId,accountId),eq(missionProgress.missionCode,code))).orderBy(sql`${missionProgress.createdAt} desc`).limit(1).for("update");
        if(old&&category!=="achievement"&&old.status==="expired")throw new ConflictException({code:"mission_expired"});
        throw new ConflictException({code:"mission_not_completed"});
      }
      if(progress.status==="claimed")throw new ConflictException({code:"mission_already_claimed"});
      if(progress.status==="expired")throw new ConflictException({code:"mission_expired"});
      if(progress.status!=="completed")throw new ConflictException({code:"mission_not_completed"});
      const [balance]=await this.wallet.lock(tx,[accountId]);if(!balance)throw new BadRequestException({code:"WALLET_NOT_FOUND"});
      const availableGold=balance.availableGold+progress.rewardGoldSnapshot;if(!validGold(availableGold)||availableGold>MAX_GOLD)throw new BadRequestException({code:"WALLET_LIMIT"});
      const entryNo=balance.version+1,claimedAt=now;
      await tx.update(wallets).set({availableGold,version:entryNo}).where(eq(wallets.accountId,accountId));
      await tx.insert(walletEntries).values({accountId,entryNo,operationKey:`mission_reward_v1:${progress.id}`,reason:"mission_reward",missionProgressId:progress.id,
        metadata:{missionCode:code,category,periodKey,definitionVersion:progress.definitionVersion,progressId:progress.id,rewardAmount:progress.rewardGoldSnapshot},
        availableDelta:progress.rewardGoldSnapshot,heldDelta:0,availableAfter:availableGold,heldAfter:balance.heldGold});
      await tx.update(missionProgress).set({status:"claimed",claimedAt,walletEntryNo:entryNo,walletAvailableAfter:availableGold,updatedAt:claimedAt}).where(eq(missionProgress.id,progress.id));
      return {missionCode:code,category,periodKey,rewardGold:progress.rewardGoldSnapshot,status:"claimed",walletBalance:availableGold,claimedAt:claimedAt.toISOString()};
    });}
}
