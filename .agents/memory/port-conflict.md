---
name: Port 8080 duplicate workflow conflict
description: Two workflows try to start the API server on the same port.
---

## Rule
There are two workflows that both try to run the API server:
- `API Server` (PORT=8080 pnpm --filter @workspace/api-server run dev) — ALWAYS FAILS (duplicate)
- `artifacts/api-server: API Server` (pnpm --filter @workspace/api-server run dev) — THE REAL ONE

Only ever restart/use `artifacts/api-server: API Server`. Never try to restart `API Server` — it will always fail with EADDRINUSE.

**Why:** The `API Server` workflow was created as a convenience alias but the `artifacts/api-server: API Server` workflow starts first and claims port 8080.
