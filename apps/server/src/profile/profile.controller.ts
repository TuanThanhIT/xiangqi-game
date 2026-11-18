import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthRequest } from "../auth/guards/auth.guard";
import { AuthOriginGuard } from "../auth/guards/origin.guard";
import { AvatarPipe, NicknamePipe } from "./profile.pipe";
import { ProfileService } from "./profile.service";

@Controller("profile") @UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profile:ProfileService){}
  @Get() get(@Req() request:AuthRequest){return this.profile.get(request.profile!.id);}
  @Get("avatars") avatars(){return this.profile.catalog();}
  @Patch("nickname") @UseGuards(AuthOriginGuard) nickname(@Req() request:AuthRequest,@Body(NicknamePipe) body:{nickname:string}){return this.profile.nickname(request.profile!.id,body.nickname);}
  @Patch("avatar") @UseGuards(AuthOriginGuard) avatar(@Req() request:AuthRequest,@Body(AvatarPipe) body:{avatarId:string}){return this.profile.avatar(request.profile!.id,body.avatarId);}
}
