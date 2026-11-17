import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { WalletModule } from "../wallet/wallet.module";
import { MissionCategoryPipe, MissionClaimPipe, MissionCodePipe, MissionController } from "./mission.controller";
import { MissionService } from "./mission.service";
@Module({imports:[AuthModule,DatabaseModule,WalletModule],controllers:[MissionController],
  providers:[MissionService,MissionCategoryPipe,MissionClaimPipe,MissionCodePipe],exports:[MissionService]})
export class MissionModule {}
