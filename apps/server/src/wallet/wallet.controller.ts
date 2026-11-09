import { BadRequestException, Controller, Get, Header, Injectable, Param, ParseUUIDPipe, PipeTransform, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { AuthRequest } from "../auth/guards/auth.guard";
import { WalletService } from "./wallet.service";
import { BettingService } from "./betting.service";

@Injectable()
export class WalletQueryPipe implements PipeTransform {
  transform(query:Record<string,unknown>):{before?:number;limit:number} {
    if(Object.keys(query).some(key=>!["before","limit"].includes(key)))throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    const number=(value:unknown)=>typeof value==="string"&&/^[1-9][0-9]{0,9}$/.test(value)?Number(value):NaN;
    const limit=query.limit===undefined?20:number(query.limit),before=query.before===undefined?undefined:number(query.before);
    if(!Number.isInteger(limit)||limit<1||limit>100||before!==undefined&&(!Number.isInteger(before)||before>2147483647)) {
      throw new BadRequestException({code:"INVALID_WALLET_QUERY"});
    }
    return {before,limit};
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
  history(@Req() request:AuthRequest,@Query(WalletQueryPipe) query:{before?:number;limit:number}) {
    return this.wallet.history(request.profile!.id,query.before,query.limit);
  }
  @Get("bets/:matchId") @Header("Cache-Control","no-store")
  bet(@Req() request:AuthRequest,@Param("matchId",new ParseUUIDPipe({version:"4"})) matchId:string) {
    return this.betting.getForAccount(matchId,request.profile!.id);
  }
}
