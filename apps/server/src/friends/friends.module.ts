import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { FriendsController } from "./friends.controller";
import { DirectionPipe,EmptyFriendsPipe,FriendRequestPipe,NicknamePipe } from "./friends.pipe";
import { FriendsService } from "./friends.service";
import { PRESENCE_CLOCK,PresenceService } from "./presence.service";
@Module({imports:[DatabaseModule,AuthModule],controllers:[FriendsController],providers:[FriendsService,PresenceService,DirectionPipe,EmptyFriendsPipe,FriendRequestPipe,NicknamePipe,{provide:PRESENCE_CLOCK,useValue:{now:()=>Date.now(),setTimeout:(callback:()=>void,ms:number)=>setTimeout(callback,ms),clearTimeout:(timer:unknown)=>clearTimeout(timer as ReturnType<typeof setTimeout>)}}],exports:[FriendsService,PresenceService]})
export class FriendsModule{}
