import { ConflictException, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { casualMatchResults, type CasualMatchResult, walletEntries, wallets } from "../db/schema";
import { MAX_GOLD, validGold, WalletService } from "./wallet.service";

export const CASUAL_REWARD_POLICY = "casual_win_reward_v1";
export const CASUAL_WIN_REWARD = 5;
const ELIGIBLE_REASONS = new Set(["checkmate", "stalemate", "total_timeout", "turn_timeout", "resignation"]);
export function isCasualRewardEligible(result:CasualMatchResult):boolean {
  return result.status==="finished"&&ELIGIBLE_REASONS.has(result.reason);
}

export interface MatchRewardInput {
  matchId:string; roomCode:string; redAccountId:string; blackAccountId:string; result:CasualMatchResult;
}

function sameResult(a:CasualMatchResult,b:CasualMatchResult):boolean {
  if(a.status!==b.status||a.reason!==b.reason)return false;
  if(a.status==="finished"&&b.status==="finished")return a.winner===b.winner&&a.loser===b.loser;
  return a.status!=="finished"&&b.status!=="finished";
}

@Injectable()
export class MatchRewardService {
  constructor(private readonly database:DatabaseService,private readonly wallet:WalletService) {}

  private details(input:MatchRewardInput) {
    const eligible=isCasualRewardEligible(input.result);
    const winnerAccountId=input.result.status==="finished"?(input.result.winner==="red"?input.redAccountId:input.blackAccountId):null;
    return {eligible,winnerAccountId,
      idempotencyKey:eligible?`${CASUAL_REWARD_POLICY}:${input.matchId}:${winnerAccountId}`:`${CASUAL_REWARD_POLICY}:${input.matchId}:not_eligible`};
  }

  async record(input:MatchRewardInput) {
    const {eligible,winnerAccountId,idempotencyKey}=this.details(input);
    return this.database.db.transaction(async tx=>{
      await tx.insert(casualMatchResults).values({matchId:input.matchId,roomCode:input.roomCode,
        redAccountId:input.redAccountId,blackAccountId:input.blackAccountId,result:input.result,reason:input.result.reason,
        winnerAccountId,rewardEligible:eligible,rewardStatus:eligible?"pending":"not_eligible",idempotencyKey}).onConflictDoNothing();
      const [row]=await tx.select().from(casualMatchResults).where(eq(casualMatchResults.matchId,input.matchId)).for("update");
      if(!row||row.roomCode!==input.roomCode||row.redAccountId!==input.redAccountId||row.blackAccountId!==input.blackAccountId||
        !sameResult(row.result,input.result)||row.idempotencyKey!==idempotencyKey)throw new ConflictException({code:"MATCH_RESULT_CONFLICT"});
      return row;
    });
  }

  async credit(matchId:string) {
    return this.database.db.transaction(async tx=>{
      const [reward]=await tx.select().from(casualMatchResults).where(eq(casualMatchResults.matchId,matchId)).for("update");
      if(!reward)throw new ConflictException({code:"MATCH_RESULT_MISSING"});
      if(!reward.rewardEligible||reward.rewardStatus==="not_eligible"||reward.rewardStatus==="credited")return reward;
      if(!reward.winnerAccountId)throw new ConflictException({code:"MATCH_REWARD_WINNER_MISSING"});
      const [balance]=await this.wallet.lock(tx,[reward.winnerAccountId]);
      if(!balance)throw new ConflictException({code:"WALLET_NOT_FOUND"});
      const availableGold=balance.availableGold+CASUAL_WIN_REWARD;
      if(!validGold(availableGold)||availableGold>MAX_GOLD)throw new ConflictException({code:"WALLET_LIMIT"});
      const entryNo=balance.version+1;
      await tx.update(wallets).set({availableGold,version:entryNo}).where(eq(wallets.accountId,balance.accountId));
      await tx.insert(walletEntries).values({accountId:balance.accountId,entryNo,
        operationKey:reward.idempotencyKey,reason:"casual_match_win_reward",rewardMatchId:matchId,
        availableDelta:CASUAL_WIN_REWARD,heldDelta:0,availableAfter:availableGold,heldAfter:balance.heldGold});
      const [credited]=await tx.update(casualMatchResults).set({rewardStatus:"credited",walletEntryNo:entryNo,walletAvailableAfter:availableGold,creditedAt:new Date()})
        .where(eq(casualMatchResults.matchId,matchId)).returning();
      return credited;
    });
  }

  async finish(input:MatchRewardInput) {await this.record(input);return this.credit(input.matchId);}
  async get(matchId:string) {return (await this.database.db.select().from(casualMatchResults).where(eq(casualMatchResults.matchId,matchId)))[0];}
  async recover() {
    const pending=await this.database.db.select({matchId:casualMatchResults.matchId}).from(casualMatchResults)
      .where(eq(casualMatchResults.rewardStatus,"pending"));
    for(const row of pending)await this.credit(row.matchId);
    return pending.length;
  }
}
