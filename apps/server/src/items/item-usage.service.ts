import { Injectable } from "@nestjs/common";
import { and, eq, gte, sql } from "drizzle-orm";
import { DatabaseService } from "../db/database.service";
import { inventoryItems, itemUsages, matchLoadouts } from "../db/schema";
import { ItemRejected } from "./item-effects";
import type { ItemRequest } from "./item-effects";

export interface UsageInput extends ItemRequest {
  accountId: string; fingerprint: string; acceptedAt: number;
  result: Record<string, unknown>; metadata: Record<string, unknown>;
}
@Injectable()
export class ItemUsageService {
  constructor(private readonly database: DatabaseService) {}
  /** Same transaction lock as consume: absence here proves the previous transaction finished without a record. */
  async reconcile(input: Pick<UsageInput, "matchId" | "accountId" | "requestId">):Promise<typeof itemUsages.$inferSelect|undefined> {
    return this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.accountId}, 42))`);
      const [row] = await tx.select().from(itemUsages).where(and(eq(itemUsages.matchId,input.matchId),
        eq(itemUsages.accountId,input.accountId),eq(itemUsages.requestId,input.requestId)));
      return row;
    });
  }
  async consume(input: UsageInput) {
    return this.database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.accountId}, 42))`);
      const [existing] = await tx.select().from(itemUsages).where(and(eq(itemUsages.matchId,input.matchId),
        eq(itemUsages.accountId,input.accountId),eq(itemUsages.requestId,input.requestId)));
      if (existing) {
        if (existing.fingerprint !== input.fingerprint) throw new ItemRejected("request_id_conflict");
        return existing;
      }
      const [snapshot] = await tx.select().from(matchLoadouts).where(and(eq(matchLoadouts.matchId,input.matchId),
        eq(matchLoadouts.accountId,input.accountId),eq(matchLoadouts.itemCode,input.itemCode)));
      if (!snapshot) throw new ItemRejected("item_not_equipped");
      const [used] = await tx.select().from(itemUsages).where(and(eq(itemUsages.matchId,input.matchId),
        eq(itemUsages.accountId,input.accountId),eq(itemUsages.itemCode,input.itemCode)));
      if (used) throw new ItemRejected("item_already_used");
      const changed = await tx.update(inventoryItems).set({quantity: sql`${inventoryItems.quantity} - 1`, updatedAt: new Date()})
        .where(and(eq(inventoryItems.accountId,input.accountId),eq(inventoryItems.itemCode,input.itemCode),gte(inventoryItems.quantity,1))).returning();
      if (!changed.length) throw new ItemRejected("item_inventory_empty");
      const [row] = await tx.insert(itemUsages).values({matchId: input.matchId, accountId: input.accountId,
        requestId: input.requestId, fingerprint: input.fingerprint, itemCode: input.itemCode,
        targetPieceId: input.targetPieceId, acceptedAt: new Date(input.acceptedAt), result: input.result, metadata: input.metadata}).returning();
      return row;
    });
  }
}
