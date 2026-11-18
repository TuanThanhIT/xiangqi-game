import { BadRequestException, Controller, Get, Header, Injectable, Param, ParseUUIDPipe, PipeTransform, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { AuthRequest } from "../auth/guards/auth.guard";
import { WalletService, type WalletCategory, type WalletEntryType, type WalletHistoryQuery } from "./wallet.service";
import { BettingService } from "./betting.service";

@Injectable()
export class WalletQueryPipe implements PipeTransform {
  transform(query:Record<string,unknown>):WalletHistoryQuery {
    if(Object.keys(query).some(key=>!["before","limit","category","type","from","to"].includes(key)))throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    const number=(value:unknown)=>typeof value==="string"&&/^[1-9][0-9]{0,9}$/.test(value)?Number(value):NaN;
    const limit=query.limit===undefined?20:number(query.limit),before=query.before===undefined?undefined:number(query.before);
    if(!Number.isInteger(limit)||limit<1||limit>100||before!==undefined&&(!Number.isInteger(before)||before>2147483647)) {
      throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    }
    const categories=["wager","purchase","reward","grant"],types=["starter_grant","bet_hold","bet_refund","bet_payout","item_purchase","casual_match_win_reward","daily_check_in_reward","check_in_7_day_bonus","check_in_30_day_bonus","mission_reward"];
    if(query.category!==undefined&&!categories.includes(String(query.category))||query.type!==undefined&&!types.includes(String(query.type)))throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
    if(query.from!==undefined&&!validDate(query.from)||query.to!==undefined&&!validDate(query.to)||query.from&&query.to&&query.from>query.to)throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    return {before,limit,...(query.category?{category:query.category as WalletCategory}:{}),...(query.type?{type:query.type as WalletEntryType}:{}),...(query.from?{from:String(query.from)}:{}),...(query.to?{to:String(query.to)}:{})};
  }
}
@Controller("wallet")
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly wallet:WalletService,private readonly betting:BettingService) {}
  @Get() @Header("Cache-Control","no-store")
  balance(@Req() request:AuthRequest,@Query(WalletQueryPipe) _query:object) {
    return this.wallet.balance(request.profile!.id);
  }
  @Get("history") @Header("Cache-Control","no-store")
  history(@Req() request:AuthRequest,@Query(WalletQueryPipe) query:WalletHistoryQuery) {
    return this.wallet.history(request.profile!.id,query);
  }
  @Get("bets/:matchId") @Header("Cache-Control","no-store")
  bet(@Req() request:AuthRequest,@Param("matchId",new ParseUUIDPipe({version:"4"})) matchId:string) {
    return this.betting.getForAccount(matchId,request.profile!.id);
  }
}
