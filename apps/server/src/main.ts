import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  await app.listen(3001);
}

void bootstrap().catch((error: unknown) => {
  console.error("Không thể khởi động backend NestJS tại cổng 3001:", error);
  process.exit(1);
});
