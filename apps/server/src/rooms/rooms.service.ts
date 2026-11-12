import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, Optional, OnModuleDestroy } from "@nestjs/common";
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Room, SeatResponse, SeatIdentity, PublicRoomState, PublicPlayer } from "./rooms.types";
import type { PublicGameState } from "./rooms.types";
import { isLegalMove, isInCheck } from "@xiangqi/rules";
import { createMatchSession, expireDraw, closeDraw, offerDraw, respondDraw, parseMatchRequest } from "./match-engine";
import type { MatchAction, MatchAck, MatchSnapshot } from "./match-engine";
import { createRoomGame, nextRoomGame, resignRoomGame } from "./room-game";
import { moveFailure, parseMoveRequest, sameMove } from "./move-request";
import type { MoveAck } from "./move-request";
import { rememberAction } from "./action-cache";
import { parseResignRequest, resignFailure } from "./resign-request";
import type { ResignAck } from "./resign-request";
import { ROOM_CLOCK, systemRoomClock } from "./room-clock";
import type { RoomClock } from "./room-clock";
import type { Side } from "@xiangqi/rules";
import type { OnlineGameResult } from "./room-game";
import type { RoomThemeId } from "./room-theme";
import type { AuthProfile } from "../auth/session/session.service";
import { clockDeadline, isTotalMinutes, nextClockTurn, publicClock, startGameClock, TURN_MS } from "./game-clock";
import { BettingService, InsufficientGold } from "../wallet/betting.service";
import { validGold, WalletService } from "../wallet/wallet.service";
import { CASUAL_WIN_REWARD, isCasualRewardEligible, MatchRewardService } from "../wallet/match-reward.service";
import type { RoomBet } from "./rooms.types";
import { LoadoutService } from "../items/loadout.service";
import { ItemUsageService, type UsageInput } from "../items/item-usage.service";
import { afterItemMove, casualResult, ItemRejected, parseItemRequest, refundTimeSaver, simulateItem, type ItemPlan } from "../items/item-effects";

// Token DI nội bộ, không lấy từ request hoặc biến môi trường.
export const ROOM_CODE_GENERATOR = Symbol("ROOM_CODE_GENERATOR");
export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly changes = new EventEmitter();
  // Gameplay decisions cannot overtake a transaction with an unknown outcome.
  // Presence can change while it runs; its absolute deadlines are adjudicated after reconciliation.
  private readonly pendingItems = new Map<Room, {side: Side; requestId: string; fingerprint: string; promise: Promise<MatchAck>}>();

  private closed = false;
  private readonly retryRooms=new Set<Room>();
  private readonly walletWork=new Set<Promise<void>>();
  private retryTimer?:ReturnType<typeof setTimeout>;
  constructor(@Inject(ROOM_CODE_GENERATOR) private readonly generateCode: () => string,
    @Optional() @Inject(ROOM_CLOCK) private readonly clock: RoomClock = systemRoomClock,
    @Optional() private readonly betting?:BettingService,
    @Optional() private readonly wallet?:WalletService,
    @Optional() private readonly loadouts?:LoadoutService,
    @Optional() private readonly itemUsage?:ItemUsageService,
    @Optional() private readonly rewards?:MatchRewardService) {}

  private online(player: Room["red"] | null): boolean { return !!(player?.activeSocketId && player.presence); }
  private clearTimer(room: Room): void { room.timerVersion++; room.cancelTimer?.(); room.cancelTimer = null; }
  private scheduleRoom(room: Room, now: number): void {
    this.clearTimer(room);
    if (this.pendingItems.has(room)) return;
    if (this.closed || (room.game?.result.status !== "playing" && !(room.red.accountId && !room.game))) return;
    // Chỉ đặt lịch cho deadline tương lai; không lặp lại timer của người đã quá hạn.
    const future = [room.red.offlineDeadline, room.black?.offlineDeadline,
      room.gameClock && room.game?.result.status === "playing" ? clockDeadline(room.gameClock).at : null,
      room.match?.offer?.status === "pending" ? room.match.offer.expiresAt : null]
      .filter((d): d is number => typeof d === "number" && d > now);
    if (!future.length) return;
    const version = room.timerVersion;
    room.cancelTimer = this.clock.schedule(() => {
      if (this.closed || this.rooms.get(room.code) !== room || version !== room.timerVersion) return;
      room.cancelTimer = null;
      this.evaluateDeadlines(room, this.clock.now());
      if (this.rooms.has(room.code)) this.notifyChange(room.code);
    }, Math.min(...future) - now);
  }
  private evaluateDeadlines(room: Room, now: number): boolean {
    if (this.pendingItems.has(room)) return false;
    if (room.red.accountId && !room.game) {
      for (const side of ["red", "black"] as const) {
        const player = room[side];
        if (player?.offlineDeadline != null && now >= player.offlineDeadline) {
          this.removeWaitingSeat(room, side, "timeout");
          if (side === "red") return true;
        }
      }
      this.scheduleRoom(room, now); return false;
    }
    if (!room.game || room.game.result.status !== "playing") { this.clearTimer(room); return false; }
    const expired = (side: Side) => room[side]?.offlineDeadline !== null &&
      typeof room[side]?.offlineDeadline === "number" && now >= room[side]!.offlineDeadline!;
    const red = expired("red"), black = expired("black");
    let result: OnlineGameResult | null = null;
    let resolvedAt = now;
    if (red && black) result = { status: "cancelled", reason: "both_disconnected" };
    else if (red && this.online(room.black)) result = { status: "finished", winner: "black", loser: "red", reason: "disconnect_timeout" };
    else if (black && this.online(room.red)) result = { status: "finished", winner: "red", loser: "black", reason: "disconnect_timeout" };
    if (room.gameClock) {
      // Compare effective decision times, even when the timer callback runs late.
      // One expired player + the other offline is not yet a disconnect result.
      if (red && black) resolvedAt = Math.max(room.red.offlineDeadline!, room.black!.offlineDeadline!);
      else if (red && result) resolvedAt = Math.max(room.red.offlineDeadline!, room.black?.connectedAt ?? 0);
      else if (black && result) resolvedAt = Math.max(room.black!.offlineDeadline!, room.red.connectedAt ?? 0);
      const deadline = clockDeadline(room.gameClock);
      if (now >= deadline.at && (!result || deadline.at <= resolvedAt)) {
        const loser = room.gameClock.activeSide;
        result = {status: "finished", loser, winner: loser === "red" ? "black" : "red", reason: deadline.reason};
        resolvedAt = deadline.at;
      }
    }
    if (result) {
      room.game = { ...room.game, result, revision: room.game.revision + 1 };
      this.stopGameClock(room, resolvedAt);
      if (room.match) closeDraw(room.match);
    }
    const drawExpired = !result && room.match ? expireDraw(room.match, now) : false;
    this.scheduleRoom(room, now);
    return result !== null || drawExpired;
  }
  private stopGameClock(room: Room, at: number): void {
    if (room.gameClock && room.gameClock.stoppedAt === null) room.gameClock.stoppedAt = at;
  }
  private refreshDeadlines(room: Room, now: number): void {
    if (room.game?.result.status === "playing") for (const side of ["red", "black"] as const) {
      const player = room[side]; if (!player) continue;
      if (this.online(player)) {
        if (player.offlineDeadline !== null && now < player.offlineDeadline) player.offlineDeadline = null;
      } else if (player.offlineDeadline === null) player.offlineDeadline = now + 60000;
    }
    this.evaluateDeadlines(room, now);
  }
  onModuleDestroy(): Promise<void> {
    this.closed=true;if(this.retryTimer)clearTimeout(this.retryTimer);
    for(const room of this.rooms.values())this.clearTimer(room);
    // Drain money writes before DatabaseService releases the process lock.
    return Promise.allSettled([...this.walletWork, ...[...this.pendingItems.values()].map(p => p.promise)]).then(()=>undefined);
  }

  create(nickname: string, themeId: RoomThemeId = "earth"): SeatResponse {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.generateCode();
      if (this.rooms.has(code)) continue;
      const red = { nickname, token: randomBytes(32).toString("base64url"), activeSocketId: null, attached: false, presence: false, requests: new Map(), offlineDeadline: null };
      this.rooms.set(code, { code, themeId, red, black: null, game: null, cancelTimer: null, timerVersion: 0 });
      return { roomCode: code, seat: "red", nickname: red.nickname, seatToken: red.token };
    }
    throw new ServiceUnavailableException({ code: "ROOM_CODE_UNAVAILABLE" });
  }

  private ensureFree(accountId: string): void {
    for (const room of this.rooms.values()) {
      if (room.red.accountId && this.evaluateDeadlines(room, this.clock.now()) && this.rooms.has(room.code)) this.notifyChange(room.code);
      if (!this.rooms.has(room.code) || (room.game && room.game.result.status !== "playing")) continue;
      if (room.red.accountId === accountId || room.black?.accountId === accountId) throw new ConflictException({code:"ACCOUNT_IN_ROOM"});
    }
  }
  createCasual(profile: AuthProfile, themeId: RoomThemeId, totalMinutes = 15): SeatResponse {
    if (!isTotalMinutes(totalMinutes)) throw new BadRequestException({code:"INVALID_TIME_CONTROL"});
    this.ensureFree(profile.id);
    const response = this.create(profile.nickname, themeId), room = this.rooms.get(response.roomCode)!;
    Object.assign(room.red, {accountId:profile.id, avatar:profile.avatar.assetPath, ready:false, loadout:[], offlineDeadline:this.clock.now()+60000});
    room.totalMinutes = totalMinutes;
    room.itemsEnabled = false;
    this.scheduleRoom(room, this.clock.now());
    return {...response, casual:true};
  }
  joinCasual(code: string, profile: AuthProfile): SeatResponse {
    this.ensureFree(profile.id);
    const room = this.rooms.get(code);
    if (!room?.red.accountId) throw new NotFoundException({code:"ROOM_NOT_FOUND"});
    return this.join(code, profile.nickname, profile);
  }
  private accountSeat(code: string, accountId: string): {room:Room; side:"red"|"black"} {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundException({code:"ROOM_NOT_FOUND"});
    if (room.red.accountId === accountId) return {room,side:"red"};
    if (room.black?.accountId === accountId) return {room,side:"black"};
    throw new ForbiddenException({code:"NOT_ROOM_MEMBER"});
  }
  setTimeControl(code: string, accountId: string, totalMinutes: number): void {
    if (!isTotalMinutes(totalMinutes)) throw new BadRequestException({code:"INVALID_TIME_CONTROL"});
    let membership = this.accountSeat(code, accountId);
    this.evaluateDeadlines(membership.room, this.clock.now());
    membership = this.accountSeat(code, accountId);
    const {room, side} = membership;
    this.assertNotStarting(room);
    if (side !== "red") throw new ForbiddenException({code:"NOT_ROOM_OWNER"});
    if (room.game) throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if (room.red.ready || room.black?.ready) throw new ConflictException({code:"PLAYERS_READY"});
    room.totalMinutes = totalMinutes;
    this.notifyChange(code);
  }
  async setBet(code:string,accountId:string,stake:number):Promise<void> {
    if(!validGold(stake))throw new BadRequestException({code:"INVALID_BET"});
    let member=this.accountSeat(code,accountId);
    this.evaluateDeadlines(member.room,this.clock.now());member=this.accountSeat(code,accountId);
    const {room,side}=member;
    this.assertNotStarting(room);
    if(side!=="red")throw new ForbiddenException({code:"NOT_ROOM_OWNER"});
    if(room.game)throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if(room.red.ready||room.black?.ready)throw new ConflictException({code:"PLAYERS_READY"});
    if(stake>0){
      if(!this.wallet)throw new ServiceUnavailableException();
      const balance=await this.wallet.balance(accountId);
      if(stake>balance.availableGold)throw new InsufficientGold([accountId]);
    }
    // Recheck after the DB read; ready/leave/start may have run meanwhile.
    if(this.rooms.get(code)!==room)throw new NotFoundException({code:"ROOM_NOT_FOUND"});
    this.assertNotStarting(room);
    if(room.game)throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if(room.red.ready||room.black?.ready)throw new ConflictException({code:"PLAYERS_READY"});
    room.stake=stake;this.notifyChange(code);
  }
  setItemsEnabled(code:string,accountId:string,enabled:boolean):void {
    let member=this.accountSeat(code,accountId);this.evaluateDeadlines(member.room,this.clock.now());member=this.accountSeat(code,accountId);
    const {room,side}=member;this.assertNotStarting(room);
    if(side!=="red")throw new ForbiddenException({code:"NOT_ROOM_OWNER"});
    if(room.game)throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if(room.red.ready||room.black?.ready)throw new ConflictException({code:"PLAYERS_READY"});
    room.itemsEnabled=enabled;this.notifyChange(code);
  }
  async setLoadout(code:string,accountId:string,itemCodes:unknown):Promise<void> {
    if(!this.loadouts)throw new ServiceUnavailableException();
    const normalized=this.loadouts.normalize(itemCodes);
    let member=this.accountSeat(code,accountId);this.evaluateDeadlines(member.room,this.clock.now());member=this.accountSeat(code,accountId);
    const {room,side}=member;this.assertNotStarting(room);
    if(room.game)throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if(!room.itemsEnabled)throw new ConflictException({code:"ITEMS_DISABLED"});
    await this.loadouts.validateOwnership(accountId,normalized);
    if(this.rooms.get(code)!==room)throw new NotFoundException({code:"ROOM_NOT_FOUND"});
    this.assertNotStarting(room);if(room.game)throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if(!room.itemsEnabled)throw new ConflictException({code:"ITEMS_DISABLED"});
    room[side]!.loadout=normalized;room[side]!.ready=false;this.notifyChange(code);
  }
  ownLoadout(code:string,accountId:string) {
    const {room,side}=this.accountSeat(code,accountId);
    return {roomCode:code,itemsEnabled:!!room.itemsEnabled,locked:!!room.game,
      matchId:room.gameMatchId??null,itemCodes:[...(room[side]!.loadout??[])]};
  }
  private assertNotStarting(room:Room):void {
    if(room.starting||room.cleanupPending)throw new ConflictException({code:"ROOM_STARTING"});
  }
  private startGame(room:Room):void {
    room.game=createRoomGame();this.clearTimer(room);
    room.red.offlineDeadline=null;room.black!.offlineDeadline=null;
    const now=this.clock.now();room.gameClock=startGameClock((room.totalMinutes??15)*60_000,now);
    room.gameMatchId ??= randomUUID();
    room.match=createMatchSession(room.gameMatchId,now,{
      red:room.itemsEnabled?[...(room.red.loadout??[])]:[],
      black:room.itemsEnabled?[...(room.black!.loadout??[])]:[],
    });
    this.scheduleRoom(room,now);
  }
  private async startPreparedGame(room:Room,matchId:string):Promise<void> {
    const red=room.red,black=room.black!;
    try{
      if(room.itemsEnabled){
        if(!this.loadouts)throw new ServiceUnavailableException();
        await this.loadouts.snapshot(matchId,[{accountId:red.accountId!,itemCodes:red.loadout??[]},{accountId:black.accountId!,itemCodes:black.loadout??[]}]);
      }
      let betStatus:RoomBet["status"]="none";
      if(room.stake){
        if(!this.betting)throw new ServiceUnavailableException();
        const bet=await this.betting.hold(matchId,room.code,red.accountId!,black.accountId!,room.stake);
        betStatus=bet.status as RoomBet["status"];
      }
      room.betStatus=betStatus;
      if(this.closed||this.rooms.get(room.code)!==room||room.red!==red||room.black!==black||
         !red.ready||!black.ready||!red.attached||!black.attached||!this.online(red)||!this.online(black)||(room.stake&&betStatus!=="held")) {
        throw new ConflictException({code:"ROOM_START_ABORTED"});
      }
      room.gameMatchId=matchId;
      this.startGame(room);
    }catch(error){
      if(room.itemsEnabled&&this.loadouts)try{await this.loadouts.discard(matchId);}catch{/* Orphan cleanup is retriable and must not expose DB details. */}
      if(error instanceof InsufficientGold){
        if(error.accountIds.includes(red.accountId!))red.ready=false;
        if(error.accountIds.includes(black.accountId!))black.ready=false;
        room.matchId=undefined;room.gameMatchId=undefined;room.betStatus="none";throw error;
      }
      if(!room.stake){
        red.ready=false;black.ready=false;room.gameMatchId=undefined;
        if(error instanceof BadRequestException||error instanceof ConflictException)throw error;
        throw new ServiceUnavailableException();
      }
      // The commit may have succeeded even if its acknowledgement was lost.
      // Keep this attempt locked until its durable hold has been found/refunded.
      red.ready=false;black.ready=false;room.cleanupPending=true;
      try{await this.cleanupStart(room);}catch{this.scheduleRetry(room);}
      if(error instanceof ConflictException)throw error;
      throw new ServiceUnavailableException();
    }
  }
  private async cleanupStart(room:Room):Promise<void> {
    if(!this.betting)throw new ServiceUnavailableException();
    const bet=room.matchId?await this.betting.get(room.matchId):undefined;
    if(bet){
      if(bet.status==="held")await this.betting.recordResult(bet.matchId,{status:"cancelled",reason:"start_aborted"});
      await this.betting.settle(bet.matchId);
    }
    room.cleanupPending=false;room.matchId=undefined;room.gameMatchId=undefined;room.betStatus="none";this.retryRooms.delete(room);
    this.notifyIfPresent(room);
  }
  private publicBet(room:Room):RoomBet {
    const status=room.betStatus??"none";
    return {stake:room.stake??0,matchId:room.matchId??null,status,starting:!!(room.starting||room.cleanupPending),
      pending:!!room.cleanupPending||!!room.game&&room.game.result.status!=="playing"&&!!room.stake&&status!=="settled"&&status!=="refunded"};
  }
  private notifyIfPresent(room:Room):void {if(this.rooms.get(room.code)===room)this.notifyChange(room.code);}
  private async reconcileUnknownItem(input:UsageInput, original:unknown) {
    for(;;){
      try{return await this.itemUsage!.reconcile(input);}
      catch{
        if(this.closed)throw original;
        await new Promise<void>(resolve=>{const timer=setTimeout(resolve,2000);timer.unref();});
      }
    }
  }
  private scheduleRetry(room:Room):void {
    this.retryRooms.add(room);
    if(this.closed||this.retryTimer)return;
    this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;void this.retrySettlements();},2000);this.retryTimer.unref();
  }
  private kickSettlement(room:Room):Promise<void> {
    if(this.closed)return Promise.resolve();
    if(room.settlementFlight)return room.settlementFlight;
    const flight=Promise.resolve().then(async()=>{
      let failed=false;
      if(room.stake&&room.matchId&&room.betStatus!=="settled"&&room.betStatus!=="refunded"){
        try{
          if(!this.betting)throw new ServiceUnavailableException();
          await this.betting.recordResult(room.matchId,room.game!.result);
          room.betStatus="result_pending";this.notifyIfPresent(room);
          const bet=await this.betting.settle(room.matchId);
          room.betStatus=bet.status as RoomBet["status"];
        }catch{failed=true;}
      }
      if(this.rewards&&room.gameMatchId&&room.rewardStatus!=="credited"&&room.rewardStatus!=="not_eligible"){
        try{
          room.rewardStatus="pending";
          if(room.game!.result.status==="playing")throw new Error("match_not_finished");
          const reward=await this.rewards.finish({matchId:room.gameMatchId,roomCode:room.code,
            redAccountId:room.red.accountId!,blackAccountId:room.black!.accountId!,result:room.game!.result});
          room.rewardStatus=reward.rewardStatus as "credited"|"not_eligible";
          room.rewardWinnerAccountId=reward.winnerAccountId;
          room.rewardWalletBalance=reward.walletAvailableAfter;
        }catch{failed=true;room.rewardStatus="pending";}
      }
      if(failed)throw new Error("finalization_pending");
      this.retryRooms.delete(room);
    }).catch(()=>{this.scheduleRetry(room);}).finally(()=>{this.walletWork.delete(flight);room.settlementFlight=undefined;this.emitSettlementState(room);});
    this.walletWork.add(flight);
    room.settlementFlight=flight;return flight;
  }
  private emitSettlementState(room:Room):void {
    // Do not immediately re-enter a failed attempt via notifyChange.
    if(this.rooms.get(room.code)!==room)return;
    for(const listener of this.changes.listeners("room-change")){try{listener(room.code);}catch{/* Safe metadata only. */}}
  }
  async retrySettlements():Promise<void> {
    for(const room of [...this.retryRooms]){
      if(this.closed)return;
      if(room.cleanupPending){
        const cleanup=this.cleanupStart(room);this.walletWork.add(cleanup);
        try{await cleanup;}catch{this.scheduleRetry(room);}finally{this.walletWork.delete(cleanup);}
      }
      else await this.kickSettlement(room);
    }
  }
  setReady(code: string, accountId: string, ready: boolean): void|Promise<void> {
    let membership = this.accountSeat(code,accountId);
    this.evaluateDeadlines(membership.room,this.clock.now());
    membership = this.accountSeat(code,accountId);
    const {room,side} = membership;
    if(room.cleanupPending)throw new ConflictException({code:"ROOM_STARTING"});
    if(room.starting){if(ready)return room.starting;throw new ConflictException({code:"ROOM_STARTING"});}
    if(room.game&&ready&&room.gameMatchId)return;
    if (room.game) throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    if (!this.online(room[side]) || !room[side]!.attached) throw new ConflictException({code:"ROOM_OFFLINE"});
    room[side]!.ready = ready;
    // No await: simultaneous requests cannot create two games or reset a started game.
    if (room.red.ready && room.black?.ready && room.red.attached && room.black.attached &&
        this.online(room.red) && this.online(room.black)) {
      if(room.stake||room.itemsEnabled){
        const matchId=room.gameMatchId??room.matchId??randomUUID();room.gameMatchId=matchId;
        if(room.stake)room.matchId=matchId;
        // Install the in-flight promise before any asynchronous hold can finish.
        const task=Promise.resolve().then(()=>this.startPreparedGame(room,matchId));room.starting=task;
        this.walletWork.add(task);
        void task.finally(()=>{this.walletWork.delete(task);if(room.starting===task)room.starting=undefined;this.notifyIfPresent(room);}).catch(()=>{});
        this.notifyChange(code);return task;
      }
      this.startGame(room);
    }
    this.notifyChange(code);
  }
  leaveCasual(code: string, accountId: string): void {
    const {room,side} = this.accountSeat(code,accountId);
    this.assertNotStarting(room);
    if (room.game) throw new ConflictException({code:"GAME_ALREADY_STARTED"});
    this.removeWaitingSeat(room,side,"left");
  }
  private removeWaitingSeat(room:Room, side:"red"|"black", reason:"left"|"timeout"): void {
    const socketId = room[side]?.activeSocketId;
    if (side === "red") { this.clearTimer(room); this.rooms.delete(room.code); }
    else { room.black = null; room.red.ready = false; this.scheduleRoom(room,this.clock.now()); }
    for(const listener of this.changes.listeners("departure")) {
      try {listener({roomCode:room.code, side, socketId, reason});}catch{/* A notification failure must not undo the departure. */}
    }
    if (side === "black") this.notifyChange(room.code);
  }
  onDeparture(listener:(event:{roomCode:string;side:"red"|"black";socketId:string|null|undefined;reason:"left"|"timeout"})=>void):()=>void {
    this.changes.on("departure",listener); return ()=>{this.changes.off("departure",listener);};
  }
  accountForSeat(identity:SeatIdentity):string|undefined { return this.rooms.get(identity.roomCode)?.[identity.seat]?.accountId; }

  // Không await giữa kiểm tra và ghi ghế: nguyên tử trong một process Node.
  join(code: string, nickname: string, profile?: AuthProfile): SeatResponse {
    const room = this.rooms.get(code);
    if (!room) throw new NotFoundException({ code: "ROOM_NOT_FOUND" });
    if (room.red.accountId && !profile) throw new ForbiddenException({code:"NOT_ROOM_MEMBER"});
    if (room.black) throw new ConflictException({ code: "ROOM_FULL" });
    let token: string;
    do { token = randomBytes(32).toString("base64url"); } while (token === room.red.token);
    const game = profile ? null : createRoomGame();
    const black = { nickname, token, activeSocketId: null, attached: false, presence: false, requests: new Map(), offlineDeadline: null };
    if (profile) Object.assign(black,{accountId:profile.id,avatar:profile.avatar.assetPath,ready:false,loadout:[],offlineDeadline:this.clock.now()+60000});
    const joined = { ...room, black, game };
    this.rooms.set(code, joined);
    this.refreshDeadlines(joined, this.clock.now());
    this.notifyChange(code);
    return { roomCode: code, seat: "black", nickname: black.nickname, seatToken: black.token, ...(profile ? {casual:true as const} : {}) };
  }

  authenticate(roomCode: string, token: string): SeatIdentity | null {
    const waiting = this.rooms.get(roomCode);
    if (waiting?.red.accountId && !waiting.game) this.evaluateDeadlines(waiting,this.clock.now());
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    for (const seat of ["red", "black"] as const) {
      const player = room[seat];
      if (player && player.token.length === token.length &&
          timingSafeEqual(Buffer.from(player.token), Buffer.from(token))) {
        return { roomCode, seat };
      }
    }
    return null;
  }

  claimSocket(identity: SeatIdentity, socketId: string): string | null {
    const room = this.rooms.get(identity.roomCode);
    if (room && this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
    const player = this.rooms.get(identity.roomCode)?.[identity.seat];
    if (!player) throw new Error("Ghế đã xác thực không còn tồn tại");
    const previous = player.activeSocketId;
    player.activeSocketId = socketId;
    player.attached = false;
    return previous;
  }

  ownsSocket(identity: SeatIdentity, socketId: string): boolean {
    return this.rooms.get(identity.roomCode)?.[identity.seat]?.activeSocketId === socketId;
  }

  releaseSocket(identity: SeatIdentity, socketId: string): boolean {
    if (!this.ownsSocket(identity, socketId)) return false;
    const room = this.rooms.get(identity.roomCode)!;
    const now = this.clock.now();
    this.evaluateDeadlines(room, now);
    if (!this.ownsSocket(identity,socketId)) return false;
    this.rooms.get(identity.roomCode)![identity.seat]!.activeSocketId = null;
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = false;
    this.rooms.get(identity.roomCode)![identity.seat]!.presence = false;
    if (room.red.accountId && !room.game) {
      room[identity.seat]!.ready = false;
      room[identity.seat]!.offlineDeadline = now+60000;
    }
    this.refreshDeadlines(room, now);
    this.notifyChange(identity.roomCode);
    return true;
  }

  publicState(code: string): PublicRoomState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const publicPlayer = (seat: "red" | "black"): PublicPlayer | null => {
      const player = room[seat];
      return player ? { nickname: player.nickname, side: seat, connected: this.online(player), ...(player.accountId ? {ready:!!player.ready,avatar:player.avatar??null} : {}) } : null;
    };
    return { roomCode: code, themeId: room.themeId,
      ...(room.red.accountId ? {casual:true as const, timeControl:{totalMs:(room.totalMinutes ?? 15)*60_000, turnMs:TURN_MS},bet:this.publicBet(room),itemsEnabled:!!room.itemsEnabled} : {}),
      players: { red: publicPlayer("red")!, black: publicPlayer("black") } };
  }

  onRoomChange(listener: (code: string) => void): () => void {
    this.changes.on("room-change", listener);
    return () => { this.changes.off("room-change", listener); };
  }

  notifyChange(code: string): void {
    const room=this.rooms.get(code);
    if (room?.match && room.game?.result.status !== "playing") closeDraw(room.match);
    if(room?.game&&room.game.result.status!=="playing"&&room.red.accountId&&
      ((room.stake&&room.matchId&&room.betStatus!=="settled"&&room.betStatus!=="refunded")||
       (this.rewards&&room.rewardStatus!=="credited"&&room.rewardStatus!=="not_eligible"))) {
      this.kickSettlement(room);
    }
    // Lỗi listener không được biến một thao tác đã ghi thành ack thất bại.
    for (const listener of this.changes.listeners("room-change")) {
      try { listener(code); } catch { /* Không log dữ liệu phòng hoặc token. */ }
    }
  }

  markSocketAttached(identity: SeatIdentity, socketId: string): boolean {
    if (!this.ownsSocket(identity, socketId)) return false;
    const room = this.rooms.get(identity.roomCode)!;
    const now = this.clock.now();
    // Đánh giá trạng thái cũ, cả dấu quá hạn, trước khi kết nối có thể thay đổi kết quả.
    const ended = this.evaluateDeadlines(room, now);
    if (!this.ownsSocket(identity,socketId)) return false;
    this.rooms.get(identity.roomCode)![identity.seat]!.attached = true;
    this.rooms.get(identity.roomCode)![identity.seat]!.presence = true;
    this.rooms.get(identity.roomCode)![identity.seat]!.connectedAt = now;
    if (room.red.accountId && !room.game) { room[identity.seat]!.offlineDeadline = null; room[identity.seat]!.ready = false; }
    this.refreshDeadlines(room, now);
    if (ended) this.notifyChange(room.code);
    return true;
  }

  publicGameState(code: string): PublicGameState {
    const room = this.rooms.get(code);
    if (!room) throw new Error("Phòng không còn tồn tại");
    const game = room.game;
    const now = this.clock.now();
    return { roomCode: code, serverNow: now, ...(room.red.accountId?{bet:this.publicBet(room)}:{}), ...(room.gameClock ? {clock:publicClock(room.gameClock,now)} : {}), deadlines: { red: game ? room.red.offlineDeadline : null, black: game ? room.black?.offlineDeadline ?? null : null },
      game: game ? structuredClone({ pieces: game.pieces, sideToMove: game.sideToMove,
      lastMove: game.lastMove, revision: game.revision, result: game.result }) : null,
      playEnabled: !!(game && game.result.status === "playing" && room.red.attached && room.red.activeSocketId &&
        room.black?.attached && room.black.activeSocketId) };
  }

  // Đồng bộ trong một process: không await từ kiểm tra quyền tới ghi bàn/cache.
  move(identity: SeatIdentity, socketId: string, payload: unknown, expectedMatchVersion?: number): MoveAck {
    const room = this.rooms.get(identity.roomCode);
    const player = room?.[identity.seat];
    if (!room || !player || !this.ownsSocket(identity, socketId) || !player.attached) {
      return moveFailure("SOCKET_NOT_ACTIVE", null);
    }
    if (this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
    const request = parseMoveRequest(payload);
    if (!request) return moveFailure("INVALID_MOVE_REQUEST", null);
    const pending = this.pendingItems.get(room);
    if (pending) return moveFailure(pending.side === identity.seat && pending.requestId === request.requestId ? "REQUEST_ID_CONFLICT" : "ACTION_PENDING", request.requestId, room.game?.revision);
    if (room.match?.requests.has(`${identity.seat}:${request.requestId}`)) return moveFailure("REQUEST_ID_CONFLICT",request.requestId,room.game?.revision);
    const cached = player.requests.get(request.requestId);
    if (cached) return structuredClone(cached.kind === "move" && sameMove(cached.request, request) ? cached.ack :
      moveFailure("REQUEST_ID_CONFLICT", request.requestId, room.game?.revision));
    const game = room.game;
    let ack: MoveAck;
    let next: ReturnType<typeof nextRoomGame> | undefined;
    try {
      if (!game) ack = moveFailure("GAME_NOT_STARTED", request.requestId);
      else if (game.result.status !== "playing") ack = moveFailure("GAME_FINISHED", request.requestId, game.revision);
      else if (!room.red.attached || !room.red.activeSocketId || !room.black?.attached || !room.black.activeSocketId) {
        ack = moveFailure("PLAYERS_OFFLINE", request.requestId, game.revision);
      } else if (request.expectedRevision !== game.revision) ack = moveFailure("STALE_REVISION", request.requestId, game.revision);
      else if (this.isStaleMatchVersion(room, expectedMatchVersion)) ack = moveFailure("STALE_REVISION", request.requestId, game.revision);
      else if (identity.seat !== game.sideToMove) ack = moveFailure("NOT_YOUR_TURN", request.requestId, game.revision);
      else if (!isLegalMove(game.pieces, identity.seat, request.pieceId, request.to, room.match?.items.effects)) {
        ack = moveFailure("ILLEGAL_MOVE", request.requestId, game.revision);
      } else {
        next = nextRoomGame(game, request.pieceId, request.to, !!room.itemsEnabled);
        const nextItems = room.match ? afterItemMove(room.match.items, next) : undefined;
        if (room.itemsEnabled && room.match && nextItems && room.gameClock) {
          next.result = casualResult(next, room.gameClock, nextItems, room.match.loadouts[next.sideToMove], this.clock.now());
        }
        // Acceptance is after legality/result computation, not the browser's timestamp.
        const acceptedAt = this.clock.now();
        this.evaluateDeadlines(room, acceptedAt);
        if (room.game!.result.status !== "playing") {
          next = undefined;
          this.notifyChange(room.code);
          ack = moveFailure("GAME_FINISHED", request.requestId, room.game!.revision);
        } else if (this.isStaleMatchVersion(room, expectedMatchVersion)) {
          next = undefined;
          this.notifyChange(room.code);
          ack = moveFailure("STALE_REVISION", request.requestId, room.game!.revision);
        } else {
          if (room.gameClock && room.match) room.gameClock = refundTimeSaver(room.gameClock, room.match.items, identity.seat, acceptedAt);
          if (room.match && nextItems) room.match.items = nextItems;
          if (room.gameClock) {
            if (next.result.status === "playing") room.gameClock = nextClockTurn(room.gameClock, next.sideToMove, acceptedAt);
            else this.stopGameClock(room, acceptedAt);
          }
          ack = { ok: true, requestId: request.requestId, appliedRevision: next.revision };
        }
      }
    } catch { ack = moveFailure("INTERNAL_ERROR", request.requestId, game?.revision); }
    const entries = rememberAction(player.requests, { kind: "move", request, ack }, !!room.red.accountId);
    // Chuẩn bị mọi dữ liệu trước khi ghi, không để lại bàn dở dang khi tính luật lỗi.
    if (next) room.game = next;
    player.requests = entries;
    if (next) this.scheduleRoom(room, this.clock.now());
    if (next) this.notifyChange(identity.roomCode);
    return ack;
  }

  private matchVersion(room: Room): number { return room.game!.revision + room.match!.drawRevision; }
  // Expiry cầu hòa có thể đổi version trong khi xử lý dù chưa có request khác.
  private isStaleMatchVersion(room: Room, expectedVersion?: number): boolean {
    return expectedVersion !== undefined && (!room.match || expectedVersion !== this.matchVersion(room));
  }

  // Snapshot riêng: chỉ socket đang giữ ghế đã xác thực được đọc.
  matchSnapshot(identity: SeatIdentity, socketId: string): MatchSnapshot | null {
    const room=this.rooms.get(identity.roomCode), player=room?.[identity.seat];
    if (!room?.match || !room.game || !room.gameClock || !player?.accountId || !player.attached || !this.ownsSocket(identity,socketId)) return null;
    if (this.evaluateDeadlines(room,this.clock.now())) this.notifyChange(room.code);
    const game=room.game, match=room.match, result=game.result;
    const wagerPending=result.status!=="playing" && !!room.stake && room.betStatus!=="settled" && room.betStatus!=="refunded";
    const pending=wagerPending;
    const reward=result.status==="playing"?null:{eligible:isCasualRewardEligible(result),amount:CASUAL_WIN_REWARD,
      status:room.rewardStatus??"pending" as const,
      ...(room.rewardStatus==="credited"&&room.rewardWinnerAccountId===player.accountId&&room.rewardWalletBalance!=null?
        {walletBalance:room.rewardWalletBalance}:{})};
    return structuredClone({matchId:match.id,roomCode:room.code,viewerSide:identity.seat,
      players:{red:{nickname:room.red.nickname},black:{nickname:room.black!.nickname}},
      board:game.pieces,sideToMove:game.sideToMove,moveNumber:game.moveNumber??0,
      stateVersion:this.matchVersion(room),captured:game.captured??[],startedAt:match.startedAt,serverNow:this.clock.now(),
      clock:publicClock(room.gameClock,this.clock.now()),inCheck:isInCheck(game.pieces,game.sideToMove,match.items.effects),
      status:result.status==="playing"?"active":pending?"result_pending":result.status==="cancelled"?"cancelled":"finished",
      result:result.status==="playing"?null:result,reason:result.status==="playing"?null:result.reason,
      reward,
      drawOffer:match.offer,drawCounts:match.counts,
      ownDrawAvailableAt:match.lastOfferAt[identity.seat]===null?null:match.lastOfferAt[identity.seat]!+60_000,
      ownLoadout:match.loadouts[identity.seat].filter(code => !match.items.used[identity.seat].includes(code as never)),
      turnSequence:match.items.turnSequence,
      activeEffects:match.items.effects.map(({ownerAccountId,...effect})=>effect),
      usedItems:match.items.history,ownUsedItems:match.items.used[identity.seat],
      ownScout:match.items.scouts[identity.seat]??null,
      ownPendingItem:this.pendingItems.get(room)?.side===identity.seat?{requestId:this.pendingItems.get(room)!.requestId,status:"pending" as const}:null});
  }

  async useItem(identity: SeatIdentity, socketId: string, payload: unknown): Promise<MatchAck> {
    const room=this.rooms.get(identity.roomCode),player=room?.[identity.seat];
    const fail=(code:string,requestId:string|null=null):MatchAck=>({ok:false,requestId,code,
      ...(room?.match&&room.game?{currentVersion:this.matchVersion(room)}:{})});
    if(!room||!player?.accountId||!player.attached||!this.ownsSocket(identity,socketId))return fail("socket_not_active");
    const request=parseItemRequest(payload);if(!request)return fail("invalid_item_request");
    if(!room.match||!room.game||!room.gameClock||request.matchId!==room.match.id)return fail("match_not_found",request.requestId);
    const match=room.match,key=`${identity.seat}:${request.requestId}`,fingerprint=JSON.stringify({action:"item_use",...request});
    const cached=match.requests.get(key);
    if(cached)return cached.fingerprint===fingerprint?structuredClone(cached.ack):fail("request_id_conflict",request.requestId);
    if(player.requests.has(request.requestId))return fail("request_id_conflict",request.requestId);
    const pending=this.pendingItems.get(room);
    if(pending){
      if(pending.side===identity.seat&&pending.requestId===request.requestId)
        return pending.fingerprint===fingerprint?pending.promise:fail("request_id_conflict",request.requestId);
      return fail("action_pending",request.requestId);
    }
    if(this.evaluateDeadlines(room,this.clock.now()))this.notifyChange(room.code);
    let validationError:string|null=room.game.result.status!=="playing"?"match_not_active":
      !room.itemsEnabled?"items_disabled":request.expectedVersion!==this.matchVersion(room)?"stale_version":
      room.game.sideToMove!==identity.seat?"not_your_turn":
      !match.loadouts[identity.seat].includes(request.itemCode)?"item_not_equipped":
      match.items.used[identity.seat].includes(request.itemCode)?"item_already_used":
      match.items.usedTurn===match.items.turnSequence?"item_already_used_this_turn":null;
    if(validationError){const ack=fail(validationError,request.requestId);match.requests.set(key,{fingerprint,ack:structuredClone(ack)});return ack;}
    const acceptedAt=this.clock.now();
    if(acceptedAt>=clockDeadline(room.gameClock).at){this.evaluateDeadlines(room,acceptedAt);this.notifyChange(room.code);
      const ack=fail("match_not_active",request.requestId);match.requests.set(key,{fingerprint,ack:structuredClone(ack)});return ack;}
    let plan:ItemPlan;
    try{plan=simulateItem(room.game,room.gameClock,match.items,identity.seat,player.accountId,request.itemCode,
      request.targetPieceId,acceptedAt,this.matchVersion(room)+1);}
    catch(error){const ack=fail(error instanceof ItemRejected?error.code:"internal_error",request.requestId);
      match.requests.set(key,{fingerprint,ack:structuredClone(ack)});return ack;}
    if(!this.itemUsage)return fail("internal_error",request.requestId);
    const input:UsageInput={...request,accountId:player.accountId,fingerprint,acceptedAt,
      result:{stateVersion:this.matchVersion(room)+1,...(plan.scout?{scout:plan.scout}:{})},
      metadata:{turnSequence:match.items.turnSequence,effectCount:plan.items.effects.length}};
    const task=(async():Promise<MatchAck>=>{
      try{
        try{await this.itemUsage!.consume(input);}catch(error){
          if(error instanceof ItemRejected)throw error;
          const durable=await this.reconcileUnknownItem(input,error);if(!durable)throw error;
          if(durable.fingerprint!==fingerprint)throw new ItemRejected("request_id_conflict");
        }
        // The pending gate guarantees no gameplay state can change after acceptedAt.
        room.game=plan.game;room.gameClock=plan.clock;match.items=plan.items;
        const ack:MatchAck={ok:true,requestId:request.requestId,stateVersion:this.matchVersion(room),...(plan.scout?{scout:plan.scout}:{})};
        match.requests.set(key,{fingerprint,ack:structuredClone(ack)});return ack;
      }catch(error){const ack=fail(error instanceof ItemRejected?error.code:"internal_error",request.requestId);
        match.requests.set(key,{fingerprint,ack:structuredClone(ack)});return ack;
      }finally{
        this.pendingItems.delete(room);this.evaluateDeadlines(room,this.clock.now());this.scheduleRoom(room,this.clock.now());this.notifyIfPresent(room);
      }
    })();
    this.pendingItems.set(room,{side:identity.seat,requestId:request.requestId,fingerprint,promise:task});
    this.clearTimer(room);
    return task;
  }

  // Không await: kiểm tra, quyết định và cache nguyên tử trong backend duy nhất.
  matchAction(identity: SeatIdentity, socketId: string, action: MatchAction, payload: unknown): MatchAck {
    const room=this.rooms.get(identity.roomCode), player=room?.[identity.seat];
    const fail=(code:string,requestId:string|null=null):MatchAck=>({ok:false,requestId,code,
      ...(room?.match&&room.game?{currentVersion:this.matchVersion(room)}:{})});
    if (!room || !player?.accountId || !player.attached || !this.ownsSocket(identity,socketId)) return fail("socket_not_active");
    if (this.evaluateDeadlines(room,this.clock.now())) this.notifyChange(room.code);
    const request=parseMatchRequest(payload,action);
    if (!request) return fail("invalid_match_request");
    if (!room.match || !room.game || request.matchId!==room.match.id) return fail("match_not_found",request.requestId);
    const match=room.match, key=`${identity.seat}:${request.requestId}`;
    const fingerprint=JSON.stringify({action,...request});
    const cached=match.requests.get(key);
    if (cached && cached.fingerprint!==fingerprint) return fail("request_id_conflict",request.requestId);
    // Response cầu hòa đến sau kết thúc phải bị từ chối, kể cả retry.
    if ((action==="draw_accept" || action==="draw_reject") && room.game.result.status!=="playing") return fail("match_not_active",request.requestId);
    if (cached) return structuredClone(cached.ack);
    // Không cho tái sử dụng key đã gửi qua giao thức V1.
    if (player.requests.has(request.requestId)) return fail("request_id_conflict",request.requestId);
    const pending = this.pendingItems.get(room);
    if (pending) return fail(pending.side === identity.seat && pending.requestId === request.requestId ? "request_id_conflict" : "action_pending", request.requestId);
    let ack:MatchAck;
    if (room.game.result.status!=="playing") ack=fail("match_not_active",request.requestId);
    else if (request.expectedVersion!==this.matchVersion(room)) ack=fail("stale_version",request.requestId);
    else if (action==="move") {
      const piece=room.game.pieces.find(p=>p.position.row===request.from!.row&&p.position.col===request.from!.col);
      const result=this.move(identity,socketId,{requestId:request.requestId,expectedRevision:room.game.revision,pieceId:piece?.id??"missing",to:request.to},request.expectedVersion);
      ack=result.ok?{ok:true,requestId:request.requestId,stateVersion:this.matchVersion(room)}:
        fail(result.code==="STALE_REVISION"?"stale_version":result.code.toLowerCase(),request.requestId);
    } else if (action==="resign") {
      const result=this.resign(identity,socketId,{requestId:request.requestId},request.expectedVersion);
      ack=result.ok?{ok:true,requestId:request.requestId,stateVersion:this.matchVersion(room)}:
        fail(result.code==="STALE_REVISION"?"stale_version":result.code.toLowerCase(),request.requestId);
    } else {
      const now=this.clock.now();
      // Phân xử deadline ngay trước khi chấp nhận, kể cả khi kiểm tra payload tốn thời gian.
      if (this.evaluateDeadlines(room,now)) this.notifyChange(room.code);
      const error=room.game.result.status!=="playing"?"match_not_active":
        request.expectedVersion!==this.matchVersion(room)?"stale_version":
        action==="draw_offer"?offerDraw(match,identity.seat,request.requestId,now):
        respondDraw(match,identity.seat,request.offerId!,action==="draw_accept");
      if (error) ack=fail(error,request.requestId);
      else {
        if (action==="draw_accept") {
          room.game={...room.game,revision:room.game.revision+1,result:{status:"draw",reason:"agreement"}};
          this.stopGameClock(room,now);
        }
        ack={ok:true,requestId:request.requestId,stateVersion:this.matchVersion(room)};
      }
    }
    match.requests.set(key,{fingerprint,ack:structuredClone(ack)});
    if (ack.ok) { this.scheduleRoom(room,this.clock.now()); this.notifyChange(room.code); }
    return ack;
  }

  // Không kiểm tra lượt hoặc đối thủ online; không await giữa xác thực và commit.
  resign(identity: SeatIdentity, socketId: string, payload: unknown, expectedMatchVersion?: number): ResignAck {
    const room = this.rooms.get(identity.roomCode);
    const player = room?.[identity.seat];
    if (!room || !player || !this.ownsSocket(identity, socketId) || !player.attached) {
      return resignFailure("SOCKET_NOT_ACTIVE", null);
    }
    if (this.evaluateDeadlines(room, this.clock.now())) this.notifyChange(room.code);
    const request = parseResignRequest(payload);
    if (!request) return resignFailure("INVALID_RESIGN_REQUEST", null);
    const pending = this.pendingItems.get(room);
    if (pending) return resignFailure(pending.side === identity.seat && pending.requestId === request.requestId ? "REQUEST_ID_CONFLICT" : "ACTION_PENDING", request.requestId, room.game?.revision);
    if (room.match?.requests.has(`${identity.seat}:${request.requestId}`)) return resignFailure("REQUEST_ID_CONFLICT",request.requestId,room.game?.revision);
    const cached = player.requests.get(request.requestId);
    if (cached) return structuredClone(cached.kind === "resign" ? cached.ack :
      resignFailure("REQUEST_ID_CONFLICT", request.requestId, room.game?.revision));
    const game = room.game;
    let ack: ResignAck;
    let next: ReturnType<typeof resignRoomGame> | undefined;
    let acceptedAt: number | undefined;
    try {
      if (!game) ack = resignFailure("GAME_NOT_STARTED", request.requestId);
      else if (game.result.status !== "playing") ack = resignFailure("GAME_FINISHED", request.requestId, game.revision);
      else if (this.isStaleMatchVersion(room, expectedMatchVersion)) ack = resignFailure("STALE_REVISION", request.requestId, game.revision);
      else {
        next = resignRoomGame(game, identity.seat);
        acceptedAt = this.clock.now();
        this.evaluateDeadlines(room, acceptedAt);
        if (room.game!.result.status !== "playing") {
          next = undefined; this.notifyChange(room.code);
          ack = resignFailure("GAME_FINISHED",request.requestId,room.game!.revision);
        } else if (this.isStaleMatchVersion(room, expectedMatchVersion)) {
          next = undefined; this.notifyChange(room.code);
          ack = resignFailure("STALE_REVISION",request.requestId,room.game!.revision);
        } else ack = { ok: true, requestId: request.requestId, appliedRevision: next.revision };
      }
    } catch { ack = resignFailure("INTERNAL_ERROR", request.requestId, game?.revision); }
    const entries = rememberAction(player.requests, { kind: "resign", request, ack }, !!room.red.accountId);
    if (next) { room.game = next; this.stopGameClock(room, acceptedAt!); }
    player.requests = entries;
    if (next) this.scheduleRoom(room, this.clock.now());
    if (next) this.notifyChange(identity.roomCode);
    return ack;
  }
}
