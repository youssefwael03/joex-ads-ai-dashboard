import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const accountBrains = pgTable("account_brains", {
  accountId:            text("account_id").primaryKey(),
  auditSummary:         text("audit_summary"),
  kpiSnapshot:          jsonb("kpi_snapshot"),
  winningCampaigns:     jsonb("winning_campaigns"),
  losingCampaigns:      jsonb("losing_campaigns"),
  audienceInsights:     jsonb("audience_insights"),
  creativeInsights:     jsonb("creative_insights"),
  scalingInsights:      jsonb("scaling_insights"),
  recommendations:      jsonb("recommendations"),
  fatigueInfo:          jsonb("fatigue_info"),
  lastDateRange:        text("last_date_range"),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});

export type AccountBrain   = typeof accountBrains.$inferSelect;
export type InsertAccountBrain = typeof accountBrains.$inferInsert;
