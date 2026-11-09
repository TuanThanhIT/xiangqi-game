import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class PurchasePipe implements PipeTransform {
  transform(value:unknown) {
    const body=value as Record<string,unknown>;
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["requestId","itemCode","quantity"].includes(k))||
      typeof body.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)||
      typeof body.itemCode!=="string"||!/^[a-z][a-z0-9_]{1,63}$/.test(body.itemCode)||!Number.isInteger(body.quantity)||Number(body.quantity)<1||Number(body.quantity)>99)
      throw new BadRequestException({code:"INVALID_PURCHASE"});
    return {requestId:body.requestId,itemCode:body.itemCode,quantity:Number(body.quantity)};
  }
}
