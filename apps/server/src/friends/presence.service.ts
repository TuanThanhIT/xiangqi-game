import { Inject, Injectable } from "@nestjs/common";
export const PRESENCE_CLOCK=Symbol("PRESENCE_CLOCK");
export interface PresenceClock{now():number;setTimeout(callback:()=>void,ms:number):unknown;clearTimeout(timer:unknown):void}
export type FriendActivity="available"|"waiting_room"|"in_match"|"unknown";
@Injectable() export class PresenceService {
  private readonly sockets=new Map<string,Set<string>>(); private readonly timers=new Map<string,unknown>(); private readonly offlineAt=new Map<string,number>(); private readonly activities=new Map<string,FriendActivity>(); private listener?: (accountId:string)=>void;
  constructor(@Inject(PRESENCE_CLOCK) private readonly clock:PresenceClock){}
  onChange(listener:(accountId:string)=>void){this.listener=listener;return()=>{if(this.listener===listener)this.listener=undefined;};}
  connect(accountId:string,socketId:string){const was=this.isOnline(accountId);this.cancel(accountId);const set=this.sockets.get(accountId)??new Set<string>();set.add(socketId);this.sockets.set(accountId,set);if(!was)this.listener?.(accountId);}
  disconnect(accountId:string,socketId:string){const set=this.sockets.get(accountId);set?.delete(socketId);if(set?.size)return;this.sockets.delete(accountId);this.offlineAt.set(accountId,this.clock.now()+30_000);this.timers.set(accountId,this.clock.setTimeout(()=>{this.timers.delete(accountId);if(!this.sockets.has(accountId)){this.offlineAt.delete(accountId);this.listener?.(accountId);}},30_000));}
  setActivity(accountId:string,activity:FriendActivity){if(this.activities.get(accountId)===activity)return;this.activities.set(accountId,activity);if(this.isOnline(accountId))this.listener?.(accountId);}
  state(accountId:string){const online=this.isOnline(accountId);return{presence:online?"online" as const:"offline" as const,activity:online?(this.activities.get(accountId)??"available"):"unknown" as const};}
  isOnline(accountId:string){return (this.sockets.get(accountId)?.size??0)>0||this.offlineAt.has(accountId);}
  reset(){for(const timer of this.timers.values())this.clock.clearTimeout(timer);this.timers.clear();this.sockets.clear();this.offlineAt.clear();this.activities.clear();}
  private cancel(accountId:string){const timer=this.timers.get(accountId);if(timer)this.clock.clearTimeout(timer);this.timers.delete(accountId);this.offlineAt.delete(accountId);}
}
