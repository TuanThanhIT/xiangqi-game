import { backendFetch, backendJson, badGateway, gatewayFailure } from "../shared/backend-http";
import { getBackendHttpOrigin } from "./room-config";
import { readRequestId } from "./request-id";
import { isCode, isSession, record } from "./room-contract";
import { isRoomThemeId } from "./room-theme";

export async function proxyCasual(request:Request, parts:string[]=[]):Promise<Response> {
  let id = readRequestId(request.headers.get("x-request-id"))??crypto.randomUUID();
  const json=(data:unknown,status:number)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","x-request-id":id}});
  const fail=(status:number,code:string,message="Chưa thể xử lý yêu cầu phòng.")=>json({statusCode:status,code,message},status);
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin)return fail(403,"ORIGIN_NOT_ALLOWED");
  const create=parts.length===0;
  if(!create && (parts.length!==2 || !isCode(parts[0]) || !["join","ready","leave"].includes(parts[1])))return fail(400,"INVALID_ROOM_CODE");
  const body:unknown=await request.json().catch(()=>null);
  const key=create?"themeId":parts[1]==="ready"?"ready":null;
  if(!record(body)||Object.keys(body).length!==(key?1:0)||(create&&!isRoomThemeId(body.themeId))||(key==="ready"&&typeof body.ready!=="boolean"))return fail(400,"INVALID_REQUEST");
  const authorization=request.headers.get("authorization")??"";
  if(!/^Bearer [A-Za-z0-9_.-]{1,4096}$/.test(authorization))return fail(401,"UNAUTHENTICATED");
  try {
    const upstream=await backendFetch(`${getBackendHttpOrigin()}/casual-rooms${create?"":"/"+parts.join("/")}`,{method:"POST",headers:{Origin:origin!,Authorization:authorization,"Content-Type":"application/json","x-request-id":id},body:JSON.stringify(body)});
    id=readRequestId(upstream.headers.get("x-request-id"))??id;
    const data=await backendJson(upstream);
    if(!upstream.ok){
      const statuses:Record<string,number>={ACCOUNT_IN_ROOM:409,NOT_ROOM_MEMBER:403,ROOM_NOT_FOUND:404,ROOM_FULL:409,GAME_ALREADY_STARTED:409,ROOM_OFFLINE:409,UNAUTHENTICATED:401,SESSION_EXPIRED:401,ORIGIN_NOT_ALLOWED:403,INVALID_REQUEST:400,INVALID_ROOM_CODE:400,ROOM_CODE_UNAVAILABLE:503,INTERNAL_ERROR:500};
      if(record(data)&&typeof data.code==="string"&&Object.hasOwn(statuses,data.code)&&statuses[data.code]===upstream.status)return fail(upstream.status,data.code);
      throw badGateway();
    }
    if(create||parts[1]==="join"){
      if(upstream.status!==(create?201:200)||!isSession(data)||data.casual!==true||data.seat!==(create?"red":"black")||(!create&&data.roomCode!==parts[0]))throw badGateway();
    }else if(upstream.status!==200||!record(data)||data.ok!==true||Object.keys(data).length!==1)throw badGateway();
    return json(data,upstream.status);
  }catch(error){const problem=gatewayFailure(error);return fail(problem.status,problem.code,problem.message);}
}
