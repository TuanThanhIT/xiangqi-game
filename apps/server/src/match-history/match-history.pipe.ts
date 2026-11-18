import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

export const HISTORY_REASONS=["checkmate","stalemate","total_timeout","turn_timeout","resignation","disconnect_timeout","agreement","both_disconnected","backend_restart"] as const;
export interface MatchHistoryQuery {cursor?:string;limit:number;mode?:"casual"|"ranked";result?:"win"|"loss"|"draw"|"cancelled";reason?:string;from?:string;to?:string}
const date=/^\d{4}-\d{2}-\d{2}$/;
const validDate=(value:string)=>date.test(value)&&new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)===value;
@Injectable()
export class MatchHistoryQueryPipe implements PipeTransform {
  transform(query:Record<string,unknown>):MatchHistoryQuery {
    const allowed=["cursor","limit","mode","result","reason","from","to"];
    if(Object.keys(query).some(key=>!allowed.includes(key)))throw new BadRequestException({code:"invalid_match_history_query"});
    const integer=(value:unknown)=>typeof value==="string"&&/^[1-9][0-9]{0,2}$/.test(value)?Number(value):NaN;
    const limit=query.limit===undefined?20:integer(query.limit);
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException({code:"invalid_match_history_query"});
    if(query.cursor!==undefined&&(typeof query.cursor!=="string"||query.cursor.length>500))throw new BadRequestException({code:"invalid_match_history_cursor"});
    if(query.mode!==undefined&&!['casual','ranked'].includes(String(query.mode)))throw new BadRequestException({code:"invalid_match_history_query"});
    if(query.result!==undefined&&!['win','loss','draw','cancelled'].includes(String(query.result)))throw new BadRequestException({code:"invalid_match_history_query"});
    if(query.reason!==undefined&&!HISTORY_REASONS.includes(query.reason as never))throw new BadRequestException({code:"invalid_match_history_query"});
    for(const key of ["from","to"] as const)if(query[key]!==undefined&&(typeof query[key]!=="string"||!validDate(query[key] as string)))throw new BadRequestException({code:"invalid_match_history_query"});
    if(query.from&&query.to&&query.from>query.to)throw new BadRequestException({code:"invalid_match_history_query"});
    return {limit,...Object.fromEntries(Object.entries(query).filter(([,v])=>v!==undefined))} as MatchHistoryQuery;
  }
}
