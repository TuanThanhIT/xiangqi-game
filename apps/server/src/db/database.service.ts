import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "./config";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({ connectionString: databaseUrl(), connectionTimeoutMillis: 5000 });
  readonly db = drizzle(this.pool, { schema });

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
