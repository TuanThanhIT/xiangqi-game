import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { APP_FILTER } from "@nestjs/core";
import { RoomsModule } from "./rooms/rooms.module";
import { HttpErrorFilter } from "./http-error.filter";
import { DatabaseModule } from "./db/database.module";
import { AuthModule } from "./auth/auth.module";
import { WalletModule } from "./wallet/wallet.module";
import { ItemsModule } from "./items/items.module";
import { CheckInModule } from "./check-in/check-in.module";

@Module({ imports: [RoomsModule, DatabaseModule, AuthModule, WalletModule, ItemsModule, CheckInModule], controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpErrorFilter }] })
export class AppModule {}
