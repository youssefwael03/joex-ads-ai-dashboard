import { db, accountBrains } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface BrainData {
  auditSummary?: string;
  kpiSnapshot?: Record<string, any>;
  winningCampaigns?: any[];
  losingCampaigns?: any[];
  audienceInsights?: Record<string, any>;
  creativeInsights?: Record<string, any>;
  scalingInsights?: Record<string, any>;
  recommendations?: any[];
  fatigueInfo?: Record<string, any>;
  lastDateRange?: string;
}

export type BrainRow = BrainData & { updatedAt: Date };

export async function loadBrain(accountId: string): Promise<BrainRow | null> {
  try {
    const rows = await db.select().from(accountBrains)
      .where(eq(accountBrains.accountId, accountId))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      auditSummary:     r.auditSummary      ?? undefined,
      kpiSnapshot:      r.kpiSnapshot       as Record<string, any> ?? undefined,
      winningCampaigns: r.winningCampaigns  as any[]               ?? undefined,
      losingCampaigns:  r.losingCampaigns   as any[]               ?? undefined,
      audienceInsights: r.audienceInsights  as Record<string, any> ?? undefined,
      creativeInsights: r.creativeInsights  as Record<string, any> ?? undefined,
      scalingInsights:  r.scalingInsights   as Record<string, any> ?? undefined,
      recommendations:  r.recommendations   as any[]               ?? undefined,
      fatigueInfo:      r.fatigueInfo       as Record<string, any> ?? undefined,
      lastDateRange:    r.lastDateRange      ?? undefined,
      updatedAt:        r.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function saveBrain(accountId: string, data: BrainData): Promise<void> {
  try {
    await db.insert(accountBrains).values({
      accountId,
      auditSummary:     data.auditSummary,
      kpiSnapshot:      data.kpiSnapshot,
      winningCampaigns: data.winningCampaigns,
      losingCampaigns:  data.losingCampaigns,
      audienceInsights: data.audienceInsights,
      creativeInsights: data.creativeInsights,
      scalingInsights:  data.scalingInsights,
      recommendations:  data.recommendations,
      fatigueInfo:      data.fatigueInfo,
      lastDateRange:    data.lastDateRange,
      updatedAt:        new Date(),
    }).onConflictDoUpdate({
      target: accountBrains.accountId,
      set: {
        auditSummary:     data.auditSummary,
        kpiSnapshot:      data.kpiSnapshot,
        winningCampaigns: data.winningCampaigns,
        losingCampaigns:  data.losingCampaigns,
        audienceInsights: data.audienceInsights,
        creativeInsights: data.creativeInsights,
        scalingInsights:  data.scalingInsights,
        recommendations:  data.recommendations,
        fatigueInfo:      data.fatigueInfo,
        lastDateRange:    data.lastDateRange,
        updatedAt:        new Date(),
      },
    });
  } catch { /* brain save failure is non-fatal */ }
}

export async function clearBrain(accountId: string): Promise<void> {
  try {
    await db.delete(accountBrains).where(eq(accountBrains.accountId, accountId));
  } catch { }
}

export function formatBrainContext(brain: BrainRow): string {
  const ageMs  = Date.now() - brain.updatedAt.getTime();
  const ageMin = Math.round(ageMs / 60_000);
  const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;

  const lines: string[] = [`ACCOUNT BRAIN — last synced: ${ageStr}`];

  if (brain.kpiSnapshot) {
    const k = brain.kpiSnapshot as Record<string, any>;
    const parts = [
      k.spend       ? `Spend: ${k.spend}`         : null,
      k.roas        ? `ROAS: ${k.roas}x`          : null,
      k.ctr         ? `CTR: ${k.ctr}%`            : null,
      k.cpm         ? `CPM: ${k.cpm}`             : null,
      k.purchases   ? `Purchases: ${k.purchases}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`KPIs: ${parts.join(" | ")}`);
  }

  if (brain.auditSummary) lines.push(`Summary: ${brain.auditSummary}`);

  if (Array.isArray(brain.winningCampaigns) && brain.winningCampaigns.length > 0) {
    const winners = brain.winningCampaigns.slice(0, 5)
      .map((c: any) => `${c.name}(ROAS:${c.roas}x)`)
      .join(", ");
    lines.push(`Winners: ${winners}`);
  }

  if (Array.isArray(brain.losingCampaigns) && brain.losingCampaigns.length > 0) {
    const losers = brain.losingCampaigns.slice(0, 3)
      .map((c: any) => `${c.name}(${c.issue ?? "low ROAS"})`)
      .join(", ");
    lines.push(`Underperformers: ${losers}`);
  }

  if (brain.audienceInsights) {
    const a = brain.audienceInsights as Record<string, any>;
    const parts = [
      a.bestAudience ? `Audience: ${a.bestAudience}` : null,
      a.bestCountry  ? `Country: ${a.bestCountry}`   : null,
      a.bestDevice   ? `Device: ${a.bestDevice}`     : null,
      a.bestAge      ? `Age: ${a.bestAge}`            : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Top Segments: ${parts.join(" | ")}`);
  }

  if (brain.creativeInsights) {
    const c = brain.creativeInsights as Record<string, any>;
    if (c.winningCreativeType) lines.push(`Best Creative: ${c.winningCreativeType}`);
    if (c.topHook) lines.push(`Top Hook: ${c.topHook}`);
  }

  if (brain.fatigueInfo) {
    const f = brain.fatigueInfo as Record<string, any>;
    if (f.fatiguedAdsets) lines.push(`Fatigued Ad Sets: ${f.fatiguedAdsets} (freq > threshold)`);
    if (f.avgFrequency)   lines.push(`Avg Frequency: ${f.avgFrequency}`);
  }

  if (Array.isArray(brain.recommendations) && brain.recommendations.length > 0) {
    const recs = brain.recommendations.slice(0, 3)
      .map((r: any, i: number) => `${i + 1}. ${r.action ?? r}`)
      .join(" | ");
    lines.push(`Priority Actions: ${recs}`);
  }

  if (brain.lastDateRange) lines.push(`Analysis period: ${brain.lastDateRange}`);

  return lines.join("\n");
}
