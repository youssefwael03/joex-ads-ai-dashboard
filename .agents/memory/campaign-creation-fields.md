---
name: Campaign creation required fields
description: Which fields Meta API requires that are easy to miss.
---

## Rule
Meta Ads API requires these fields that our original code was missing:

**create_campaign:**
- `buying_type: "AUCTION"` — required for all standard campaigns

**create_adset:**
- `bid_strategy: "LOWEST_COST_WITHOUT_CAP"` — required or Meta returns validation error
- `promoted_object: { pixel_id, custom_event_type }` — required for OUTCOME_SALES (PURCHASE) and OUTCOME_LEADS (LEAD)

**execute_campaign_template:**
- Auto-fetches pixel via `GET /act_{id}/adspixels?fields=id,name&limit=1` if no `pixel_id` provided
- Adds `bid_strategy` and `promoted_object` to ALL adsets in template

**Error messages:**
- Use `buildMetaError(data.error)` helper (in ai.ts) which surfaces `error_user_title`, `error_user_msg`, and `code` from Meta API error objects — much more actionable than just `error.message`.

**Why:** Without buying_type and bid_strategy, Meta rejects with code 100. Without promoted_object for OUTCOME_SALES, adset creation fails with a different validation error.
