import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { databaseUrl } from "./config";
import * as schema from "./schema";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({ connectionString: databaseUrl(), connectionTimeoutMillis: 5000 });
  readonly db = drizzle(this.pool, { schema });
  private runtimeClient?: PoolClient;

  async acquireGameRuntime(lockKey=1): Promise<void> {
    const client=await this.pool.connect();
    try {
      const result=await client.query("select pg_try_advisory_lock(5785937, $1) as acquired",[lockKey]);
      if(!result.rows[0].acquired)throw new Error("Một backend khác đang quản lý phòng và cược trong database này.");
      this.runtimeClient=client;
      client.on("error",()=>{
        // Continuing without the lock could let another process refund our live games.
        console.error("Mất khóa backend quản lý phòng/cược. Backend dừng để bảo toàn trạng thái.");
        process.exit(1);
      });
    }catch(error){client.release();throw error;}
  }

  async onApplicationShutdown(): Promise<void> {
    if(this.runtimeClient){
      // Closing this dedicated session releases the advisory lock, including on failure.
      this.runtimeClient.release(true);this.runtimeClient=undefined;
    }
    await this.pool.end();
  }
}
