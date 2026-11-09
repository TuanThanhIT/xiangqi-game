import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { wagers, walletEntries } from "../db/schema";
import { validGold, WalletService } from "./wallet.service";

export type BetResult = NonNullable<typeof wagers.$inferSelect.result>;
const winningReasons=["checkmate","stalemate","resignation","disconnect_timeout","turn_timeout","total_timeout"];
export function betResult(value:unknown):BetResult {
  if(typeof value!=="object"||value===null)throw new BadRequestException({code:"INVALID_BET_RESULT"});
  const r=value as Record<string,unknown>;
  if(r.status==="finished"&&winningReasons.includes(String(r.reason))&&
     (r.winner==="red"||r.winner==="black")&&r.loser===(r.winner==="red"?"black":"red")) {
    return {status:"finished",winner:r.winner,loser:r.winner==="red"?"black":"red",reason:String(r.reason)};
  }
  if(r.status==="draw"&&r.reason==="agreement")return {status:"draw",reason:"agreement"};
  if(r.status==="cancelled"&&["both_disconnected","backend_restart","start_aborted"].includes(String(r.reason))) {
    return {status:"cancelled",reason:String(r.reason)};
  }
  throw new BadRequestException({code:"INVALID_BET_RESULT"});
}
const sameResult=(a:BetResult,b:BetResult)=>JSON.stringify(betResult(a))===JSON.stringify(betResult(b));
@Injectable()
export class BettingService {
  constructor(private readonly database:DatabaseService,private readonly wallet:WalletService) {}
  async hold(matchId:string,roomCode:string,redAccountId:string,blackAccountId:string,stake:number) {
    if(!validGold(stake)||stake===0||redAccountId===blackAccountId)throw new BadRequestException({code:"INVALID_BET"});
    return this.database.db.transaction(async tx=>{
      await tx.insert(wagers).values({matchId,roomCode,redAccountId,blackAccountId,stake,status:"held"}).onConflictDoNothing();
      const [bet]=await tx.select().from(wagers).where(eq(wagers.matchId,matchId)).for("update");
      if(bet.roomCode!==roomCode||bet.redAccountId!==redAccountId||bet.blackAccountId!==blackAccountId||bet.stake!==stake)throw new ConflictException({code:"BET_ID_CONFLICT"});
      // A successful hold is represented by the wager plus both ledger entries, atomically.
      const balances=await this.wallet.lock(tx,[redAccountId,blackAccountId]);
      const entries=await tx.select({entryNo:walletEntries.entryNo}).from(walletEntries).where(and(eq(walletEntries.matchId,matchId),eq(walletEntries.reason,"bet_hold"))).limit(1);
      if(entries.length)return bet;
      if(balances.length!==2)throw new ConflictException({code:"WALLET_NOT_FOUND"});
      const insufficient=balances.filter(row=>row.availableGold<stake).map(row=>row.accountId);
      if(insufficient.length)throw new InsufficientGold(insufficient);
      for(const row of balances)await this.wallet.change(tx,row,-stake,stake,"bet_hold",matchId);
      return bet;
    });
  }
  async recordResult(matchId:string,input:unknown) {
    const result=betResult(input);
    return this.database.db.transaction(async tx=>{
      const [bet]=await tx.select().from(wagers).where(eq(wagers.matchId,matchId)).for("update");
      if(!bet)throw new ConflictException({code:"BET_NOT_FOUND"});
      if(bet.result){if(!sameResult(bet.result,result))throw new ConflictException({code:"BET_RESULT_CONFLICT"});return bet;}
      const [updated]=await tx.update(wagers).set({result,status:"result_pending",resultAt:new Date()}).where(eq(wagers.matchId,matchId)).returning();
      return updated;
    });
  }
  async settle(matchId:string) {
    return this.database.db.transaction(async tx=>{
      const [bet]=await tx.select().from(wagers).where(eq(wagers.matchId,matchId)).for("update");
      if(!bet)throw new ConflictException({code:"BET_NOT_FOUND"});
      if(bet.status==="settled"||bet.status==="refunded")return bet;
      if(!bet.result||bet.status!=="result_pending")throw new ConflictException({code:"BET_RESULT_MISSING"});
      const result=betResult(bet.result);
      const balances=await this.wallet.lock(tx,[bet.redAccountId,bet.blackAccountId]);
      if(balances.length!==2)throw new ConflictException({code:"WALLET_NOT_FOUND"});
      for(const row of balances){
        const winner=result.status==="finished"?(result.winner==="red"?bet.redAccountId:bet.blackAccountId):null;
        const returned=result.status==="finished"?(row.accountId===winner?bet.stake*2:0):bet.stake;
        await this.wallet.change(tx,row,returned,-bet.stake,result.status==="finished"?"bet_payout":"bet_refund",matchId);
      }
      const [updated]=await tx.update(wagers).set({status:result.status==="finished"?"settled":"refunded",settledAt:new Date()}).where(eq(wagers.matchId,matchId)).returning();
      return updated;
    });
  }
  async finish(matchId:string,result:unknown) {await this.recordResult(matchId,result);return this.settle(matchId);}
  async get(matchId:string) {return (await this.database.db.select().from(wagers).where(eq(wagers.matchId,matchId)))[0];}
  async getForAccount(matchId:string,accountId:string) {
    const bet=await this.get(matchId);
    if(!bet||![bet.redAccountId,bet.blackAccountId].includes(accountId))throw new NotFoundException({code:"BET_NOT_FOUND"});
    const {redAccountId:_red,blackAccountId:_black,...state}=bet;return state;
  }
  async recover() {
    // Called by main before listen, while holding the single-backend runtime lock.
    const pending=await this.database.db.select().from(wagers).where(inArray(wagers.status,["held","result_pending"]));
    for(const bet of pending){
      if(bet.status==="held")await this.recordResult(bet.matchId,{status:"cancelled",reason:"backend_restart"});
      await this.settle(bet.matchId);
    }
    return pending.length;
  }
}
export class InsufficientGold extends ConflictException {
  constructor(readonly accountIds:string[]){super({code:"INSUFFICIENT_GOLD"});}
}
