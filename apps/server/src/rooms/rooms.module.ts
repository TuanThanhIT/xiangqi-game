import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService, ROOM_CODE_GENERATOR, generateRoomCode } from "./rooms.service";
import { RoomCodePipe, RoomRequestPipe } from "./room-request.pipe";

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomCodePipe, RoomRequestPipe,
    { provide: ROOM_CODE_GENERATOR, useValue: generateRoomCode }],
})
export class RoomsModule {}
