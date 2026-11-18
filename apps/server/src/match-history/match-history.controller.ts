import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthRequest } from "../auth/guards/auth.guard";
import { MatchHistoryQueryPipe, type MatchHistoryQuery } from "./match-history.pipe";
import { MatchHistoryService } from "./match-history.service";
@Controller("match-history") @UseGuards(AuthGuard)
export class MatchHistoryController {
  constructor(private readonly history:MatchHistoryService){}
  @Get() @Header("Cache-Control","no-store") list(@Req() req:AuthRequest,@Query(MatchHistoryQueryPipe) query:MatchHistoryQuery){return this.history.list(req.profile!.id,query);}
  @Get(":matchId") @Header("Cache-Control","no-store") detail(@Req() req:AuthRequest,@Param("matchId",new ParseUUIDPipe({version:"4"})) matchId:string){return this.history.detail(req.profile!.id,matchId);}
}
