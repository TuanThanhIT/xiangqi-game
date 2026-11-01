import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { APP_FILTER } from "@nestjs/core";
import { RoomsModule } from "./rooms/rooms.module";
import { HttpErrorFilter } from "./http-error.filter";

@Module({ imports: [RoomsModule], controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpErrorFilter }] })
export class AppModule {}
