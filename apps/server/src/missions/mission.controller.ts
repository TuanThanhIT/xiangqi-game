import { BadRequestException, Body, Controller, Get, Header, Injectable, Param, PipeTransform, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, type AuthRequest } from "../auth/guards/auth.guard";
import { MissionService } from "./mission.service";
import type { MissionCategory } from "./mission-catalog";

@Injectable()
export class MissionCategoryPipe implements PipeTransform {
  transform(value:unknown):MissionCategory|"all" {if(value===undefined)return "all";
    if(value==="daily"||value==="weekly"||value==="achievement"||value==="all")return value;
    throw new BadRequestException({code:"invalid_mission_category"});}
}
@Injectable()
export class MissionClaimPipe implements PipeTransform {
  transform(value:unknown):object {if(value===undefined||value===null)return {};
    if(typeof value!=="object"||Array.isArray(value)||Object.keys(value).length)throw new BadRequestException({code:"mission_claim_conflict"});return {};}
}
@Injectable()
export class MissionCodePipe implements PipeTransform {
  transform(value:unknown):string {if(typeof value!=="string"||!/^[a-z][a-z0-9_]{1,63}$/.test(value))throw new BadRequestException({code:"mission_not_found"});return value;}
}

@Controller("missions") @UseGuards(AuthGuard)
export class MissionController {
  constructor(private readonly missions:MissionService){}
  @Get() @Header("Cache-Control","no-store") list(@Req() request:AuthRequest,@Query("category",MissionCategoryPipe) category:MissionCategory|"all"){
    return this.missions.list(request.profile!.id,category);}
  @Post(":code/claim") @Header("Cache-Control","no-store") claim(@Req() request:AuthRequest,@Param("code",MissionCodePipe) code:string,@Body(MissionClaimPipe) _body:object){
    return this.missions.claim(request.profile!.id,code);}
}
