import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../../db/database.service";
import { accounts, emailOtps, emailSends, sessions } from "../../db/schema";
import { AUTH_CLOCK } from "../auth-clock";
import { authConfig } from "../auth.config";
import { hashPassword } from "../password";
import { OtpMailer } from "../otp/delivery/otp-mailer";
import type { ResetConfirm } from "./password-reset.pipe";
type Tx=Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
const PUBLIC={accepted:true as const,message:"Nếu tài khoản hợp lệ, mã xác minh sẽ được gửi tới email."};
const digest=(id:string,accountId:string,code:string)=>createHmac("sha256",authConfig().key).update(`xiangqi:email-otp:v1:password_reset:${id}:${accountId}:${code}`).digest("hex");
@Injectable()
export class PasswordResetService{
 constructor(private readonly database:DatabaseService,private readonly mailer:OtpMailer,@Inject(AUTH_CLOCK)private readonly now:()=>Date){}
 private async lock(tx:Tx,email:string){await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'auth-email:'+email},0))`);}
 async request(email:string){
  const reservation=await this.database.db.transaction(async tx=>{
   await this.lock(tx,email);const [account]=await tx.select().from(accounts).where(and(eq(accounts.emailKey,email),isNotNull(accounts.emailVerifiedAt))).for("update");if(!account)return null;
   const now=this.now(),recent=await tx.select().from(emailSends).where(and(eq(emailSends.emailKey,email),eq(emailSends.status,"sent"),gt(emailSends.sentAt,new Date(now.getTime()-3600000)))).orderBy(desc(emailSends.sentAt)).limit(5);
   const [inFlight]=await tx.select({id:emailSends.id}).from(emailSends).where(and(eq(emailSends.emailKey,email),eq(emailSends.status,"failed"),gt(emailSends.attemptedAt,new Date(now.getTime()-60000)))).limit(1);
   if(inFlight||(recent[0]&&now.getTime()<recent[0].sentAt!.getTime()+60000)||recent.length>=5)return null;
   const id=randomUUID(),code=randomInt(0,1000000).toString().padStart(6,"0");await tx.insert(emailSends).values({id,emailKey:email,purpose:"password_reset",attemptedAt:now,status:"failed"});
   return {id,code,accountId:account.id};
  });
  if(!reservation)return PUBLIC;
  try{await this.mailer.send({id:reservation.id,email,code:reservation.code,purpose:"password_reset"});}
  catch{await this.database.db.delete(emailSends).where(and(eq(emailSends.id,reservation.id),eq(emailSends.status,"failed")));return PUBLIC;}
  await this.database.db.transaction(async tx=>{
   await this.lock(tx,email);const [account]=await tx.select({id:accounts.id}).from(accounts).where(and(eq(accounts.id,reservation.accountId),eq(accounts.emailKey,email),isNotNull(accounts.emailVerifiedAt))).for("update");
   if(!account)return;
   const sentAt=this.now();await tx.update(emailSends).set({status:"sent",sentAt}).where(and(eq(emailSends.id,reservation.id),eq(emailSends.status,"failed")));
   await tx.update(emailOtps).set({invalidatedAt:sentAt}).where(and(eq(emailOtps.accountId,account.id),eq(emailOtps.purpose,"password_reset"),isNull(emailOtps.consumedAt),isNull(emailOtps.invalidatedAt)));
   await tx.insert(emailOtps).values({id:reservation.id,accountId:account.id,purpose:"password_reset",digest:digest(reservation.id,account.id,reservation.code),sentAt,expiresAt:new Date(sentAt.getTime()+300000)});
  });return PUBLIC;
 }
 async confirm(input:ResetConfirm){const passwordHash=await hashPassword(input.newPassword);const result=await this.database.db.transaction(async tx=>{
  await this.lock(tx,input.email);const now=this.now();const [account]=await tx.select().from(accounts).where(and(eq(accounts.emailKey,input.email),isNotNull(accounts.emailVerifiedAt))).for("update");if(!account)return false;
  const [otp]=await tx.select().from(emailOtps).where(and(eq(emailOtps.accountId,account.id),eq(emailOtps.purpose,"password_reset"),isNull(emailOtps.consumedAt),isNull(emailOtps.invalidatedAt))).for("update");
  if(!otp||otp.failedAttempts>=5||otp.expiresAt.getTime()<=now.getTime())return false;
  if(!timingSafeEqual(Buffer.from(otp.digest,"hex"),Buffer.from(digest(otp.id,account.id,input.otp),"hex"))){const attempts=otp.failedAttempts+1;await tx.update(emailOtps).set({failedAttempts:attempts,...(attempts>=5?{invalidatedAt:now}:{})}).where(eq(emailOtps.id,otp.id));return false;}
  await tx.update(emailOtps).set({consumedAt:now}).where(eq(emailOtps.id,otp.id));await tx.update(accounts).set({passwordHash}).where(eq(accounts.id,account.id));
  await tx.update(sessions).set({revokedAt:now}).where(and(eq(sessions.accountId,account.id),isNull(sessions.revokedAt)));return true;
 });if(!result)throw new BadRequestException({code:"INVALID_OR_EXPIRED_RESET_CODE"});return {ok:true as const};}
}
