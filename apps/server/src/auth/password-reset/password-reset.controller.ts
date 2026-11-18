import { Body, Controller, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { AuthOriginGuard } from "../guards/origin.guard";
import { clearRefreshCookie } from "../auth.config";
import { PasswordResetConfirmPipe, PasswordResetRequestPipe, type ResetConfirm, type ResetRequest } from "./password-reset.pipe";
import { PasswordResetService } from "./password-reset.service";
interface Reply{setHeader(name:string,value:string):void}
@Controller("auth/password-reset") @UseGuards(AuthOriginGuard)
export class PasswordResetController{
 constructor(private readonly reset:PasswordResetService){}
 @Post("request") @HttpCode(200) request(@Body(PasswordResetRequestPipe) body:ResetRequest){return this.reset.request(body.email);}
 @Post("confirm") @HttpCode(200) async confirm(@Body(PasswordResetConfirmPipe) body:ResetConfirm,@Res({passthrough:true})response:Reply){const result=await this.reset.confirm(body);response.setHeader("Set-Cookie",clearRefreshCookie());return result;}
}
