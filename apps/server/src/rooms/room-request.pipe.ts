import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class RoomRequestPipe implements PipeTransform<unknown, string> {
  transform(body: unknown): string {
    if (typeof body !== "object" || body === null || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !("nickname" in body) || typeof body.nickname !== "string") {
      throw new BadRequestException({ code: "INVALID_REQUEST" });
    }
    const nickname = body.nickname.trim();
    const length = Array.from(nickname).length;
    if (length < 1 || length > 30) throw new BadRequestException({ code: "INVALID_REQUEST" });
    return nickname;
  }
}

@Injectable()
export class RoomCodePipe implements PipeTransform<string, string> {
  transform(code: string): string {
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
      throw new BadRequestException({ code: "INVALID_ROOM_CODE" });
    }
    return code;
  }
}
