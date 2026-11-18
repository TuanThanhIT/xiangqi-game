import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { LoginPipe } from "../login/login.pipe";
export interface ResetRequest{email:string}
export interface ResetConfirm extends ResetRequest{otp:string;newPassword:string}
const email=(value:unknown)=>{try{return new LoginPipe().transform({email:value,password:"x"}).email;}catch{throw new BadRequestException({code:"INVALID_PASSWORD_RESET_REQUEST"});}};
@Injectable() export class PasswordResetRequestPipe implements PipeTransform<unknown,ResetRequest>{transform(value:unknown){
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.keys(value).length!==1||!("email" in value))throw new BadRequestException({code:"INVALID_PASSWORD_RESET_REQUEST"});return {email:email(value.email)};
}}
@Injectable() export class PasswordResetConfirmPipe implements PipeTransform<unknown,ResetConfirm>{transform(value:unknown){
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.keys(value).length!==3||!("email" in value)||!("otp" in value)||!("newPassword" in value)||
 typeof value.otp!=="string"||!/^\d{6}$/.test(value.otp)||typeof value.newPassword!=="string"||!value.newPassword.length||Buffer.byteLength(value.newPassword,"utf8")>1024)
  throw new BadRequestException({code:"INVALID_PASSWORD_RESET_REQUEST"});return {email:email(value.email),otp:value.otp,newPassword:value.newPassword};
}}
