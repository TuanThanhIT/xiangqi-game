import { Module } from "@nestjs/common";
import { DatabaseModule } from "../db/database.module";
import { AuthModule } from "../auth/auth.module";
import { MatchHistoryController } from "./match-history.controller";
import { MatchHistoryQueryPipe } from "./match-history.pipe";
import { MatchHistoryService } from "./match-history.service";
import { FriendsModule } from "../friends/friends.module";
@Module({imports:[DatabaseModule,AuthModule,FriendsModule],controllers:[MatchHistoryController],providers:[MatchHistoryService,MatchHistoryQueryPipe],exports:[MatchHistoryService]})
export class MatchHistoryModule {}
