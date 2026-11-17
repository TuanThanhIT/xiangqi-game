import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService, ROOM_CODE_GENERATOR, generateRoomCode } from "./rooms.service";
import { CreateRoomRequestPipe, RoomCodePipe, RoomRequestPipe } from "./room-request.pipe";
import { RoomsGateway } from "./rooms.gateway";
import { AuthModule } from "../auth/auth.module";
import { CasualRoomsController } from "./casual-rooms.controller";
import { WalletModule } from "../wallet/wallet.module";
import { ItemsModule } from "../items/items.module";
import { MissionModule } from "../missions/mission.module";

@Module({
  imports: [AuthModule,WalletModule,ItemsModule,MissionModule],
  controllers: [RoomsController, CasualRoomsController],
  providers: [RoomsService, RoomsGateway, RoomCodePipe, RoomRequestPipe, CreateRoomRequestPipe,
    { provide: ROOM_CODE_GENERATOR, useValue: generateRoomCode }],
})
export class RoomsModule {}
