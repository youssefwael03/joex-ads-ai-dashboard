---
name: Instagram follower_count period bug
description: Why Instagram insights returned empty data.
---

## Rule
Meta Instagram Insights API metrics have different valid period values:
- `impressions`, `reach`, `profile_views` → period: `day` ✓
- `follower_count` → period: `lifetime` ONLY (using `day` returns empty/error)

The original code requested `follower_count,impressions,reach,profile_views` all with `.period(day)` which caused `follower_count` to fail, sometimes breaking the whole insights response.

**Fix:** Request only `impressions,reach,profile_views` with `period(day)`. The `followers_count` value is already included as a direct field on the `instagram_business_account` object — no separate insights call needed.

**How to apply:** In `meta.ts` `/meta/instagram` route, the insights query should only include metrics that support day period.
