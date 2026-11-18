import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class NicknamePipe implements PipeTransform<unknown,{nickname:string}> {
  transform(value:unknown){
    if(typeof value!=="object"||value===null||Array.isArray(value)||Object.keys(value).length!==1||!("nickname" in value)||typeof value.nickname!=="string")throw new BadRequestException({code:"INVALID_NICKNAME"});
    const nickname=value.nickname.trim().replace(/\s+/gu," ");
    if(!nickname||[...nickname].length>30)throw new BadRequestException({code:"INVALID_NICKNAME"});
    return {nickname};
  }
}

@Injectable()
export class AvatarPipe implements PipeTransform<unknown,{avatarId:string}> {
  transform(value:unknown){
    if(typeof value!=="object"||value===null||Array.isArray(value)||Object.keys(value).length!==1||!("avatarId" in value)||typeof value.avatarId!=="string"||
      !/^[A-Za-z0-9._:-]{1,64}$/.test(value.avatarId))throw new BadRequestException({code:"INVALID_AVATAR"});
    return {avatarId:value.avatarId};
  }
}
