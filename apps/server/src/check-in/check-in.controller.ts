import { BadRequestException, Body, Controller, Get, Header, Injectable, PipeTransform, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthRequest } from "../auth/guards/auth.guard";
import { AuthOriginGuard } from "../auth/guards/origin.guard";
import { CheckInService } from "./check-in.service";

@Injectable()
export class CheckInClaimPipe implements PipeTransform {
  transform(value:unknown){if(value===undefined||value===null)return {};
    if(typeof value!=="object"||Array.isArray(value)||Object.keys(value).length)throw new BadRequestException({code:"INVALID_CHECK_IN_REQUEST"});return {};}
}
@Controller("check-in") @UseGuards(AuthGuard)
export class CheckInController {
  constructor(private readonly checkIn:CheckInService){}
  @Get() @Header("Cache-Control","no-store") status(@Req() request:AuthRequest){return this.checkIn.status(request.profile!.id);}
  @Post("claim") @UseGuards(AuthOriginGuard) @Header("Cache-Control","no-store") claim(@Req() request:AuthRequest,@Body(CheckInClaimPipe) _body:object){return this.checkIn.claim(request.profile!.id);}
}
