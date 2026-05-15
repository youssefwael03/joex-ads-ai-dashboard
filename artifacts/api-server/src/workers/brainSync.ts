import { db } from "@workspace/db";
import { accountBrains } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 55 * 60 * 1000;

export interface SyncResult {
  accountId: string;
  skipped: boolean;
  reason?: string;
}

export async function getStaleAccounts(): Promise<string[]> {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const rows = await db
      .select({ accountId: accountBrains.accountId })
      .from(accountBrains)
      .where(sql`${accountBrains.updatedAt} < ${cutoff}`);
    return rows.map((r) => r.accountId);
  } catch (err) {
    logger.error({ err }, "brainSync: failed to query stale accounts");
    return [];
  }
}

export async function markBrainStale(accountId: string): Promise<void> {
  try {
    await db
      .update(accountBrains)
      .set({ updatedAt: new Date(0) })
      .where(sql`${accountBrains.accountId} = ${accountId}`);
    logger.info({ accountId }, "brainSync: marked account brain as stale");
  } catch (err) {
    logger.warn({ err, accountId }, "brainSync: failed to mark brain stale");
  }
}

export function startBrainSyncWorker(): void {
  logger.info({ intervalMs: SYNC_INTERVAL_MS }, "brainSync: worker started");

  setInterval(async () => {
    try {
      const stale = await getStaleAccounts();
      if (stale.length === 0) {
        logger.debug("brainSync: no stale accounts, skipping");
        return;
      }
      logger.info({ stale }, "brainSync: marking accounts for refresh");
      for (const accountId of stale) {
        await markBrainStale(accountId);
      }
    } catch (err) {
      logger.error({ err }, "brainSync: interval error");
    }
  }, SYNC_INTERVAL_MS);
}
