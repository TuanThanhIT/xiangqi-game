import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { BettingService } from "./betting.service";
import { MatchRewardService } from "./match-reward.service";
@Module({imports:[DatabaseModule,AuthModule],controllers:[WalletController],providers:[WalletService,BettingService,MatchRewardService],exports:[WalletService,BettingService,MatchRewardService]})
export class WalletModule {}
