import { randomUUID } from "node:crypto";
import type { Side } from "@xiangqi/rules";

export const MATCH_EMOTE_CODES = ["HELLO","GOOD_LUCK","NICE_MOVE","THINKING","SURPRISED","GG","THANKS","SORRY"] as const;
export type MatchEmoteCode = typeof MATCH_EMOTE_CODES[number];
export type MatchChatMessage = {messageId:string;matchId:string;sequence:number;senderSide:Side;sentAt:number} &
  ({kind:"text";text:string}|{kind:"emote";emoteCode:MatchEmoteCode});
export type MatchChatRequest = {matchId:string;requestId:string} & ({kind:"text";text:string}|{kind:"emote";emoteCode:MatchEmoteCode});
export type MatchChatAck = {ok:true;requestId:string;message:MatchChatMessage;replayed:boolean}|
  {ok:false;requestId:string|null;code:string;retryAfterMs?:number};
export interface MatchChatState {
  open:boolean; sequence:number; messages:MatchChatMessage[];
  requests:Map<string,{fingerprint:string;message:MatchChatMessage}>;
  successes:Map<string,number[]>; closedAt:number|null; closeReason:string|null;
}

const requestId=/^[A-Za-z0-9._:-]{1,128}$/;
const matchId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const codePoints=(value:string)=>[...value].length;

export function createMatchChatState():MatchChatState {
  return {open:true,sequence:0,messages:[],requests:new Map(),successes:new Map(),closedAt:null,closeReason:null};
}

export function parseMatchChatRequest(value:unknown):{request:MatchChatRequest;fingerprint:string}|{code:string;requestId:string|null} {
  if(!object(value)||typeof value.requestId!=="string"||!requestId.test(value.requestId))return {code:"INVALID_CHAT_REQUEST",requestId:null};
  const id=value.requestId;
  if(typeof value.matchId!=="string"||!matchId.test(value.matchId)||typeof value.kind!=="string")return {code:"INVALID_CHAT_REQUEST",requestId:id};
  if(value.kind==="text"){
    if(Object.keys(value).length!==4||typeof value.text!=="string")return {code:"INVALID_CHAT_REQUEST",requestId:id};
    if(/[^\P{Cc}\t\n\r]/u.test(value.text))return {code:"INVALID_CHAT_TEXT",requestId:id};
    const text=value.text.trim().replace(/\s+/gu," ");
    if(!text||codePoints(text)>120)return {code:"INVALID_CHAT_TEXT",requestId:id};
    const request:MatchChatRequest={matchId:value.matchId.toLowerCase(),requestId:id,kind:"text",text};
    return {request,fingerprint:JSON.stringify(request)};
  }
  if(value.kind==="emote"){
    if(Object.keys(value).length!==4||typeof value.emoteCode!=="string")return {code:"INVALID_CHAT_REQUEST",requestId:id};
    if(!MATCH_EMOTE_CODES.includes(value.emoteCode as MatchEmoteCode))return {code:"INVALID_CHAT_EMOTE",requestId:id};
    const request:MatchChatRequest={matchId:value.matchId.toLowerCase(),requestId:id,kind:"emote",emoteCode:value.emoteCode as MatchEmoteCode};
    return {request,fingerprint:JSON.stringify(request)};
  }
  return {code:"INVALID_CHAT_REQUEST",requestId:id};
}

export function sendMatchChat(state:MatchChatState,request:MatchChatRequest,fingerprint:string,side:Side,accountId:string,now:number):MatchChatAck {
  const cached=state.requests.get(`${accountId}:${request.requestId}`);
  if(cached)return cached.fingerprint===fingerprint?{ok:true,requestId:request.requestId,message:structuredClone(cached.message),replayed:true}:
    {ok:false,requestId:request.requestId,code:"CHAT_REQUEST_ID_CONFLICT"};
  if(!state.open)return {ok:false,requestId:request.requestId,code:"CHAT_NOT_AVAILABLE"};
  const recent=(state.successes.get(accountId)??[]).filter(at=>now-at<60_000);
  const cooldown=recent.length?Math.max(0,1_000-(now-recent.at(-1)!)):0;
  const window=recent.length>=20?Math.max(0,60_000-(now-recent[0]!)):0;
  const retryAfterMs=Math.max(cooldown,window);
  if(retryAfterMs>0){state.successes.set(accountId,recent);return {ok:false,requestId:request.requestId,code:"CHAT_RATE_LIMITED",retryAfterMs};}
  const message:MatchChatMessage=request.kind==="text"?
    {messageId:randomUUID(),matchId:request.matchId,sequence:++state.sequence,senderSide:side,kind:"text",text:request.text,sentAt:now}:
    {messageId:randomUUID(),matchId:request.matchId,sequence:++state.sequence,senderSide:side,kind:"emote",emoteCode:request.emoteCode,sentAt:now};
  state.messages.push(message);if(state.messages.length>20)state.messages.shift();
  state.requests.set(`${accountId}:${request.requestId}`,{fingerprint,message:structuredClone(message)});
  state.successes.set(accountId,[...recent,now]);
  return {ok:true,requestId:request.requestId,message:structuredClone(message),replayed:false};
}
