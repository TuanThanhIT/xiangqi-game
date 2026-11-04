import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService, ROOM_CODE_GENERATOR, generateRoomCode } from "./rooms.service";
import { CreateRoomRequestPipe, RoomCodePipe, RoomRequestPipe } from "./room-request.pipe";
import { RoomsGateway } from "./rooms.gateway";

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway, RoomCodePipe, RoomRequestPipe, CreateRoomRequestPipe,
    { provide: ROOM_CODE_GENERATOR, useValue: generateRoomCode }],
})
export class RoomsModule {}
