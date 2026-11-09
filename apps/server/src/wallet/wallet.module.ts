import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";
import { BettingService } from "./betting.service";
@Module({imports:[DatabaseModule,AuthModule],controllers:[WalletController],providers:[WalletService,BettingService],exports:[WalletService,BettingService]})
export class WalletModule {}
