import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { isRoomThemeId } from "./room-theme";
import type { RoomThemeId } from "./room-theme";
function exact(value:unknown,key?:string):value is Record<string,unknown> {
  return typeof value==="object" && value!==null && !Array.isArray(value) && Object.keys(value).length===(key?1:0) && (!key||Object.hasOwn(value,key));
}
@Injectable()
export class CasualCreatePipe implements PipeTransform<unknown,{themeId:RoomThemeId}> {
  transform(value:unknown):{themeId:RoomThemeId} {
    if(!exact(value,"themeId")||!isRoomThemeId(value.themeId))throw new BadRequestException({code:"INVALID_REQUEST"});
    return {themeId:value.themeId};
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
export class CasualEmptyPipe implements PipeTransform {
  transform(value:unknown):Record<string,never> {
    if(!exact(value))throw new BadRequestException({code:"INVALID_REQUEST"});
    return {};
  }
}
