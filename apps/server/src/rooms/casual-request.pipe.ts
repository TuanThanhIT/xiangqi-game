import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { isRoomThemeId } from "./room-theme";
import type { RoomThemeId } from "./room-theme";
import { isTotalMinutes } from "./game-clock";
import { validGold } from "../wallet/wallet.service";
function exact(value:unknown,key?:string):value is Record<string,unknown> {
  return typeof value==="object" && value!==null && !Array.isArray(value) && Object.keys(value).length===(key?1:0) && (!key||Object.hasOwn(value,key));
}
@Injectable()
export class CasualCreatePipe implements PipeTransform<unknown,{themeId:RoomThemeId;totalMinutes:number}> {
  transform(value:unknown):{themeId:RoomThemeId;totalMinutes:number} {
    if(typeof value!=="object" || value===null || Array.isArray(value) ||
       !Object.hasOwn(value,"themeId") || Object.keys(value).some(key=>!["themeId","totalMinutes"].includes(key))) {
      throw new BadRequestException({code:"INVALID_REQUEST"});
    }
    const input = value as Record<string,unknown>;
    if(!isRoomThemeId(input.themeId))throw new BadRequestException({code:"INVALID_REQUEST"});
    const totalMinutes = Object.hasOwn(input,"totalMinutes") ? input.totalMinutes : 15;
    if(!isTotalMinutes(totalMinutes))throw new BadRequestException({code:"INVALID_TIME_CONTROL"});
    return {themeId:input.themeId,totalMinutes};
  }
}
@Injectable()
export class CasualTimeControlPipe implements PipeTransform<unknown,{totalMinutes:number}> {
  transform(value:unknown):{totalMinutes:number} {
    if(!exact(value,"totalMinutes"))throw new BadRequestException({code:"INVALID_REQUEST"});
    if(!isTotalMinutes(value.totalMinutes))throw new BadRequestException({code:"INVALID_TIME_CONTROL"});
    return {totalMinutes:value.totalMinutes};
  }
}
@Injectable()
export class CasualBetPipe implements PipeTransform<unknown,{stake:number}> {
  transform(value:unknown):{stake:number} {
    if(!exact(value,"stake"))throw new BadRequestException({code:"INVALID_REQUEST"});
    if(!validGold(value.stake))throw new BadRequestException({code:"INVALID_BET"});
    return {stake:value.stake};
  }
}
@Injectable()
export class CasualReadyPipe implements PipeTransform<unknown,{ready:boolean}> {
  transform(value:unknown):{ready:boolean} {
    if(!exact(value,"ready")||typeof value.ready!=="boolean")throw new BadRequestException({code:"INVALID_REQUEST"});
    return {ready:value.ready};
  }
}
@Injectable()
export class CasualItemsPipe implements PipeTransform<unknown,{enabled:boolean}> {
  transform(value:unknown):{enabled:boolean} {
    if(!exact(value,"enabled")||typeof value.enabled!=="boolean")throw new BadRequestException({code:"INVALID_REQUEST"});
    return {enabled:value.enabled};
  }
}
@Injectable()
export class CasualLoadoutPipe implements PipeTransform<unknown,{itemCodes:unknown[]}> {
  transform(value:unknown):{itemCodes:unknown[]} {
    if(!exact(value,"itemCodes")||!Array.isArray(value.itemCodes))throw new BadRequestException({code:"INVALID_LOADOUT"});
    return {itemCodes:value.itemCodes};
  }
}
@Injectable()
export class CasualEmptyPipe implements PipeTransform {
  transform(value:unknown):Record<string,never> {
    if(!exact(value))throw new BadRequestException({code:"INVALID_REQUEST"});
    return {};
  }
}
