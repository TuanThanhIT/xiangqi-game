import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureHttp } from "./configure-http";
import type { JsonParserApplication } from "./configure-http";
import { DatabaseService } from "./db/database.service";
import { BettingService } from "./wallet/betting.service";
import { MatchRewardService } from "./wallet/match-reward.service";
import { MissionService } from "./missions/mission.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<JsonParserApplication>(AppModule, { abortOnError: false, bodyParser: false });
  configureHttp(app);
  app.enableShutdownHooks();
  // Never recover while another instance still owns live in-memory games.
  await app.get(DatabaseService).acquireGameRuntime();
  await app.get(BettingService).recover();
  await app.get(MatchRewardService).recover();
  await app.get(MissionService).recover();
  await app.listen(3001);
}

void bootstrap().catch(() => {
  console.error("Không thể khởi động backend NestJS tại cổng 3001. Kiểm tra cấu hình và kết nối dịch vụ.");
  process.exit(1);
});
