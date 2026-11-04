import { Body, Controller, Header, HttpCode, Param, Post } from "@nestjs/common";
import { CreateRoomRequestPipe, RoomCodePipe, RoomRequestPipe } from "./room-request.pipe";
import type { CreateRoomRequest } from "./room-request.pipe";
import { RoomsService } from "./rooms.service";
import type { SeatResponse } from "./rooms.types";

@Controller("rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @HttpCode(201)
  @Header("Cache-Control", "no-store")
  create(@Body(CreateRoomRequestPipe) request: CreateRoomRequest): SeatResponse {
    return this.rooms.create(request.nickname, request.themeId);
  }

  @Post(":code/join")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  join(@Param("code", RoomCodePipe) code: string, @Body(RoomRequestPipe) nickname: string): SeatResponse {
    return this.rooms.join(code, nickname);
  }
}
