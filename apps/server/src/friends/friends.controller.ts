import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthRequest } from "../auth/guards/auth.guard";
import { AuthOriginGuard } from "../auth/guards/origin.guard";
import { FriendsService } from "./friends.service";
import { DirectionPipe, EmptyFriendsPipe, FriendRequestPipe, NicknamePipe } from "./friends.pipe";
@Controller() @UseGuards(AuthGuard) export class FriendsController {
  constructor(private readonly friends:FriendsService){}
  @Get("players/search") @Header("Cache-Control","no-store") search(@Req() req:AuthRequest,@Query("nickname",NicknamePipe) nickname:string){return this.friends.search(req.profile!.id,nickname);}
  @Get("friends") @Header("Cache-Control","no-store") list(@Req() req:AuthRequest){return this.friends.list(req.profile!.id);}
  @Get("friends/requests") @Header("Cache-Control","no-store") requests(@Req() req:AuthRequest,@Query("direction",DirectionPipe) direction:"incoming"|"outgoing"){return this.friends.requests(req.profile!.id,direction);}
  @Post("friends/requests") @UseGuards(AuthOriginGuard) @HttpCode(200) send(@Req() req:AuthRequest,@Body(FriendRequestPipe) body:{targetAccountId:string}){return this.friends.send(req.profile!.id,body.targetAccountId);}
  @Post("friends/requests/:id/accept") @UseGuards(AuthOriginGuard) @HttpCode(200) accept(@Req() req:AuthRequest,@Param("id",new ParseUUIDPipe({version:"4"})) id:string,@Body(EmptyFriendsPipe) _body:Record<string,never>){return this.friends.resolve(req.profile!.id,id,"accepted");}
  @Post("friends/requests/:id/reject") @UseGuards(AuthOriginGuard) @HttpCode(200) reject(@Req() req:AuthRequest,@Param("id",new ParseUUIDPipe({version:"4"})) id:string,@Body(EmptyFriendsPipe) _body:Record<string,never>){return this.friends.resolve(req.profile!.id,id,"rejected");}
  @Delete("friends/requests/:id") @UseGuards(AuthOriginGuard) cancel(@Req() req:AuthRequest,@Param("id",new ParseUUIDPipe({version:"4"})) id:string){return this.friends.resolve(req.profile!.id,id,"cancelled");}
  @Delete("friends/:accountId") @UseGuards(AuthOriginGuard) unfriend(@Req() req:AuthRequest,@Param("accountId",new ParseUUIDPipe({version:"4"})) id:string){return this.friends.unfriend(req.profile!.id,id);}
  @Get("blocks") @Header("Cache-Control","no-store") blocks(@Req() req:AuthRequest){return this.friends.blocks(req.profile!.id);}
  @Post("blocks/:accountId") @UseGuards(AuthOriginGuard) @HttpCode(200) block(@Req() req:AuthRequest,@Param("accountId",new ParseUUIDPipe({version:"4"})) id:string,@Body(EmptyFriendsPipe) _body:Record<string,never>){return this.friends.block(req.profile!.id,id);}
  @Delete("blocks/:accountId") @UseGuards(AuthOriginGuard) unblock(@Req() req:AuthRequest,@Param("accountId",new ParseUUIDPipe({version:"4"})) id:string){return this.friends.unblock(req.profile!.id,id);}
}
