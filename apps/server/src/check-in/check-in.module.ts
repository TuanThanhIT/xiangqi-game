import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../db/database.module";
import { WalletModule } from "../wallet/wallet.module";
import { CheckInController, CheckInClaimPipe } from "./check-in.controller";
import { CheckInService } from "./check-in.service";
@Module({imports:[AuthModule,DatabaseModule,WalletModule],controllers:[CheckInController],providers:[CheckInService,CheckInClaimPipe],exports:[CheckInService]})
export class CheckInModule {}
