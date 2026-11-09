import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { AuthRequest } from "../auth/guards/auth.guard";
import { AuthOriginGuard } from "../auth/guards/origin.guard";
import { RoomsService } from "./rooms.service";
import { RoomCodePipe } from "./room-request.pipe";
import type { RoomThemeId } from "./room-theme";
import { CasualBetPipe, CasualCreatePipe, CasualEmptyPipe, CasualItemsPipe, CasualLoadoutPipe, CasualReadyPipe, CasualTimeControlPipe } from "./casual-request.pipe";
@Controller("casual-rooms")
@UseGuards(AuthGuard)
export class CasualRoomsController {
  constructor(private readonly rooms: RoomsService) {}
  @Post() @UseGuards(AuthOriginGuard) @HttpCode(201) @Header("Cache-Control", "no-store")
  create(@Req() request: AuthRequest, @Body(CasualCreatePipe) body: {themeId:RoomThemeId;totalMinutes:number}) {
    return this.rooms.createCasual(request.profile!, body.themeId, body.totalMinutes);
  }
  @Post(":code/time-control") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control", "no-store")
  timeControl(@Req() request: AuthRequest, @Param("code", RoomCodePipe) code: string, @Body(CasualTimeControlPipe) body:{totalMinutes:number}) {
    this.rooms.setTimeControl(code,request.profile!.id,body.totalMinutes); return {ok:true};
  }
  @Post(":code/bet") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control", "no-store")
  async bet(@Req() request:AuthRequest,@Param("code",RoomCodePipe) code:string,@Body(CasualBetPipe) body:{stake:number}) {
    await this.rooms.setBet(code,request.profile!.id,body.stake);return {ok:true};
  }
  @Post(":code/items") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control","no-store")
  items(@Req() request:AuthRequest,@Param("code",RoomCodePipe) code:string,@Body(CasualItemsPipe) body:{enabled:boolean}) {
    this.rooms.setItemsEnabled(code,request.profile!.id,body.enabled);return {ok:true};
  }
  @Get(":code/loadout") @Header("Cache-Control","no-store")
  loadout(@Req() request:AuthRequest,@Param("code",RoomCodePipe) code:string) {
    return this.rooms.ownLoadout(code,request.profile!.id);
  }
  @Post(":code/loadout") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control","no-store")
  async updateLoadout(@Req() request:AuthRequest,@Param("code",RoomCodePipe) code:string,@Body(CasualLoadoutPipe) body:{itemCodes:unknown[]}) {
    await this.rooms.setLoadout(code,request.profile!.id,body.itemCodes);return {ok:true};
  }
  @Post(":code/join") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control", "no-store")
  join(@Req() request: AuthRequest, @Param("code", RoomCodePipe) code: string, @Body(CasualEmptyPipe) _body: Record<string,never>) {
    return this.rooms.joinCasual(code, request.profile!);
  }
  @Post(":code/ready") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control", "no-store")
  async ready(@Req() request: AuthRequest, @Param("code", RoomCodePipe) code: string, @Body(CasualReadyPipe) body: {ready:boolean}) {
    await this.rooms.setReady(code, request.profile!.id, body.ready); return {ok:true};
  }
  @Post(":code/leave") @UseGuards(AuthOriginGuard) @HttpCode(200) @Header("Cache-Control", "no-store")
  leave(@Req() request: AuthRequest, @Param("code", RoomCodePipe) code: string, @Body(CasualEmptyPipe) _body: Record<string,never>) {
    this.rooms.leaveCasual(code, request.profile!.id); return {ok:true};
  }
}
