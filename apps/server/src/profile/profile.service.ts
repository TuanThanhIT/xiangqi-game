import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { accounts, avatars } from "../db/schema";
import { AUTH_CLOCK } from "../auth/auth-clock";

const COOLDOWN=30*24*60*60*1000;
@Injectable()
export class ProfileService {
  constructor(private readonly database:DatabaseService,@Inject(AUTH_CLOCK) private readonly now:()=>Date){}
  private dto(row:{id:string;email:string;emailVerifiedAt:Date|null;nickname:string;createdAt:Date;nicknameChangedAt:Date|null;avatar:{id:string;name:string;assetPath:string|null}}){
    const next=row.nicknameChangedAt?new Date(row.nicknameChangedAt.getTime()+COOLDOWN):null;
    return {id:row.id,email:row.email,emailVerifiedAt:row.emailVerifiedAt?.toISOString()??null,nickname:row.nickname,avatar:row.avatar,
      createdAt:row.createdAt.toISOString(),nicknameChangedAt:row.nicknameChangedAt?.toISOString()??null,
      nextNicknameChangeAt:next?.toISOString()??null,canChangeNickname:!next||this.now().getTime()>=next.getTime()};
  }
  private async read(db:DatabaseService["db"],accountId:string){
    const [row]=await db.select({id:accounts.id,email:accounts.email,emailVerifiedAt:accounts.emailVerifiedAt,nickname:accounts.nickname,
      createdAt:accounts.createdAt,nicknameChangedAt:accounts.nicknameChangedAt,avatar:{id:avatars.id,name:avatars.name,assetPath:avatars.assetPath}})
      .from(accounts).innerJoin(avatars,eq(accounts.avatarId,avatars.id)).where(eq(accounts.id,accountId));
    if(!row)throw new NotFoundException({code:"PROFILE_NOT_FOUND"});return row;
  }
  async get(accountId:string){return this.dto(await this.read(this.database.db,accountId));}
  async catalog(){return {items:await this.database.db.select({id:avatars.id,name:avatars.name,assetPath:avatars.assetPath}).from(avatars).orderBy(avatars.id)};}
  async nickname(accountId:string,nickname:string){
    try{return await this.database.db.transaction(async tx=>{
      const [current]=await tx.select().from(accounts).where(eq(accounts.id,accountId)).for("update");
      if(!current)throw new NotFoundException({code:"PROFILE_NOT_FOUND"});
      const normalized=await tx.execute(sql`select lower(btrim(regexp_replace(${nickname}, '[[:space:]]+', ' ', 'g'))) as key`);
      if(String(normalized.rows[0].key)===current.nicknameKey)return this.dto(await this.read(tx as never,accountId));
      const next=current.nicknameChangedAt&&new Date(current.nicknameChangedAt.getTime()+COOLDOWN);
      if(next&&this.now().getTime()<next.getTime())throw new ConflictException({code:"NICKNAME_CHANGE_COOLDOWN",retryAfterMs:next.getTime()-this.now().getTime(),nextNicknameChangeAt:next.toISOString()});
      await tx.update(accounts).set({nickname,nicknameChangedAt:this.now()}).where(eq(accounts.id,accountId));
      return this.dto(await this.read(tx as never,accountId));
    });}catch(error){const dbCode=typeof error==="object"&&error!==null?((error as {code?:unknown;cause?:{code?:unknown}}).code??(error as {cause?:{code?:unknown}}).cause?.code):undefined;
      if(dbCode==="23505")throw new ConflictException({code:"NICKNAME_ALREADY_IN_USE"});throw error;}
  }
  async avatar(accountId:string,avatarId:string){return this.database.db.transaction(async tx=>{
    const [avatar]=await tx.select({id:avatars.id}).from(avatars).where(eq(avatars.id,avatarId));if(!avatar)throw new NotFoundException({code:"AVATAR_NOT_FOUND"});
    const changed=await tx.update(accounts).set({avatarId}).where(eq(accounts.id,accountId)).returning({id:accounts.id});
    if(!changed.length)throw new NotFoundException({code:"PROFILE_NOT_FOUND"});return this.dto(await this.read(tx as never,accountId));
  });}
}
