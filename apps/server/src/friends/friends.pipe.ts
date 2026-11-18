import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
@Injectable() export class FriendRequestPipe implements PipeTransform<unknown,{targetAccountId:string}>{transform(value:unknown){if(!plain(value)||Object.keys(value).length!==1||typeof value.targetAccountId!=="string"||!uuid.test(value.targetAccountId))throw new BadRequestException({code:"invalid_friend_request"});return{targetAccountId:value.targetAccountId};}}
@Injectable() export class EmptyFriendsPipe implements PipeTransform<unknown,Record<string,never>>{transform(value:unknown){if(!plain(value)||Object.keys(value).length)throw new BadRequestException({code:"invalid_friend_request"});return{};}}
@Injectable() export class DirectionPipe implements PipeTransform<string,"incoming"|"outgoing">{transform(value:string){if(value!=="incoming"&&value!=="outgoing")throw new BadRequestException({code:"invalid_friend_request"});return value;}}
@Injectable() export class NicknamePipe implements PipeTransform<string,string>{transform(value:string){if(typeof value!=="string"||value.length>100||!value.trim())throw new BadRequestException({code:"invalid_player_search"});return value;}}
