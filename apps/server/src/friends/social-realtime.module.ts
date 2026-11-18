import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { RoomsModule } from "../rooms/rooms.module";
import { FriendsGateway } from "./friends.gateway";
import { FriendsModule } from "./friends.module";
import { RoomInvitesService } from "./room-invites.service";
@Module({imports:[AuthModule,DatabaseModule,FriendsModule,RoomsModule],providers:[RoomInvitesService,FriendsGateway]}) export class SocialRealtimeModule{}
