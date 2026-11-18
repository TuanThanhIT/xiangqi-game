import { OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { IncomingMessage } from "node:http";
import type { Namespace,Socket } from "socket.io";
import { SessionService } from "../auth/session/session.service";
import { SOCKET_ORIGINS,isAllowedSocketOrigin } from "../rooms/socket-origin";
import { FriendsService } from "./friends.service";
import { PresenceService } from "./presence.service";
import { RoomsService } from "../rooms/rooms.service";
import { RoomInvitesService } from "./room-invites.service";
interface Data{accountId?:string}
type FriendSocket=Socket<Record<string,never>,Record<string,(value:unknown)=>void>,Record<string,never>,Data>;
@WebSocketGateway({namespace:"/friends",cors:{origin:SOCKET_ORIGINS},allowRequest:(request:IncomingMessage,cb:(error:string|null,success:boolean)=>void)=>cb(null,isAllowedSocketOrigin(request.headers.origin))})
export class FriendsGateway implements OnGatewayInit,OnGatewayConnection,OnGatewayDisconnect,OnModuleDestroy {
  private server!:Namespace;private unsubscribe?:()=>void;private unsubscribeInvites?:()=>void;private unsubscribeRooms?:()=>void;private unsubscribeRelationships?:()=>void;
  constructor(private readonly sessions:SessionService,private readonly presence:PresenceService,private readonly friends:FriendsService,private readonly rooms:RoomsService,private readonly invites:RoomInvitesService){}
  afterInit(server:Namespace){this.server=server;server.use((socket,next)=>{void(async()=>{try{const auth=socket.handshake.auth;if(!auth||typeof auth!=="object"||Array.isArray(auth)||Object.keys(auth).length!==1||typeof (auth as {accessToken?:unknown}).accessToken!=="string")throw 0;const profile=await this.sessions.authenticate(`Bearer ${(auth as {accessToken:string}).accessToken}`);socket.data.accountId=profile.id;socket.handshake.auth={};next();}catch{next(Object.assign(new Error("Không thể xác thực."),{data:{code:"AUTH_FAILED"}}));}})();});this.unsubscribe=this.presence.onChange(id=>{this.presence.setActivity(id,this.rooms.friendActivity(id));if(!this.presence.isOnline(id))this.invites.invalidateOffline(id);void this.publish(id);});this.unsubscribeInvites=this.invites.onEvent((id,event,payload)=>this.server.to(`account:${id}`).emit(event,payload));this.unsubscribeRooms=this.rooms.onRoomChange(code=>{for(const id of this.rooms.friendRoomAccounts(code))this.presence.setActivity(id,this.rooms.friendActivity(id));});this.unsubscribeRelationships=this.friends.onRelationshipChange((a,b)=>{this.server.to(`account:${a}`).emit("friends:relationship:changed",{accountId:b});this.server.to(`account:${b}`).emit("friends:relationship:changed",{accountId:a});});}
  async handleConnection(socket:FriendSocket){const id=socket.data.accountId;if(!id){socket.disconnect(true);return;}this.presence.connect(id,socket.id);await socket.join(`account:${id}`);socket.emit("friends:presence:snapshot",await this.friends.list(id));}
  handleDisconnect(socket:FriendSocket){if(socket.data.accountId)this.presence.disconnect(socket.data.accountId,socket.id);}
  private async publish(changed:string){const list=await this.friends.list(changed);for(const friend of list.items){this.server.to(`account:${friend.accountId}`).emit("friends:presence:changed",{accountId:changed,...this.presence.state(changed)});}}
  @SubscribeMessage("friends:room-invite:create") async createInvite(@ConnectedSocket() socket:FriendSocket,@MessageBody() body:unknown){try{const id=socket.data.accountId;if(!id||!validCreate(body))return{ok:false,code:"invalid_room_invite"};return{ok:true,invite:await this.invites.create(id,body)};}catch(error){return socketError(error);}}
  @SubscribeMessage("friends:room-invite:accept") async acceptInvite(@ConnectedSocket() socket:FriendSocket,@MessageBody() body:unknown){try{const id=socket.data.accountId;if(!id||!validResolution(body))return{ok:false,code:"invalid_room_invite"};return await this.invites.accept(id,body);}catch(error){return socketError(error);}}
  @SubscribeMessage("friends:room-invite:decline") async declineInvite(@ConnectedSocket() socket:FriendSocket,@MessageBody() body:unknown){try{const id=socket.data.accountId;if(!id||!validResolution(body))return{ok:false,code:"invalid_room_invite"};return await this.invites.decline(id,body);}catch(error){return socketError(error);}}
  onModuleDestroy(){this.unsubscribe?.();this.unsubscribeInvites?.();this.unsubscribeRooms?.();this.unsubscribeRelationships?.();this.presence.reset();}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,room=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
function validCreate(v:unknown):v is {requestId:string;roomCode:string;targetAccountId:string}{return!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===3&&uuid.test(String((v as any).requestId))&&uuid.test(String((v as any).targetAccountId))&&room.test(String((v as any).roomCode));}
function validResolution(v:unknown):v is {requestId:string;inviteId:string}{if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).length!==2)return false;const x=v as Record<string,unknown>;return typeof x.requestId==="string"&&/^[A-Za-z0-9._:-]{1,128}$/.test(x.requestId)&&typeof x.inviteId==="string"&&uuid.test(x.inviteId);}
function socketError(error:unknown){const response=error&&typeof error==="object"&&"getResponse" in error?(error as {getResponse():unknown}).getResponse():null;return{ok:false,code:response&&typeof response==="object"&&"code" in response?String(response.code):"internal_error"};}
