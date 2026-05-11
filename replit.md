# Joex Ads Dashboard

A production-grade AI-powered advertising analytics platform for media buyers, agencies, ecommerce brands, and performance marketers. Connect your Meta account via a long-lived access token and get a full Performance Marketing Operating System.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, serves `/api/*` proxy routes)
- `pnpm --filter @workspace/joex-ads run dev` — run the frontend (port 18098, serves `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, Zustand, TanStack React Query, Wouter
- API Proxy: Express 5 (NO database — token stored in localStorage only)
- Validation: Zod (`zod/v4`)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend pages: `artifacts/joex-ads/src/pages/`
- Zustand stores: `artifacts/joex-ads/src/store/`
- Meta API client: `artifacts/joex-ads/src/lib/metaApi.ts`
- React Query hooks: `artifacts/joex-ads/src/hooks/useMeta.ts`
- Backend proxy routes: `artifacts/api-server/src/routes/meta.ts`
- Theme/CSS: `artifacts/joex-ads/src/index.css`

## Architecture decisions

- No database — user token stored in localStorage key `joex_ads_token`, no server-side persistence
- Secure proxy architecture: frontend never calls Meta API directly; all calls go through `/api/meta/*` proxy which reads the token from `X-Meta-Token` request header
- Token is never logged (pino logger has token header redacted)
- Dark-mode-only app — `.dark` class is permanently applied to `<html>` in `main.tsx`
- Zustand stores: authStore (token + validation), accountStore (selected ad account), dateStore (global date range)

## Product

- Token auth: paste a Meta long-lived access token → validated against /me API → stored in localStorage
- Multi-account selector: searchable dropdown of all ad accounts with status, currency, timezone
- Executive Dashboard: 13 KPI cards + 6 Recharts visualizations (spend trend, ROAS, CTR, placement/country/device breakdowns)
- Campaign/AdSet/Ad tables: sortable, filterable, searchable, paginated with CSV export
- AI Segmentation Engine: auto-classifies campaigns into 10 segments (Winners, Fatigued, High Risk, etc.)
- AI Recommendation Engine: rule-based analysis generating Priority-ranked recommendations with evidence
- Creative Intelligence: ad gallery sorted by performance metrics
- Instagram/Facebook Insights: follower growth, reach, engagement
- Leads Center: lead forms + leads table with quality scoring
- Catalog Analytics: product catalog browser
- Automation & Alerts: ROAS/Frequency/Spend/CTR monitors
- PDF Reports: @react-pdf/renderer report generation

## User preferences

- Dark mode only (permanently applied)
- Gold (#F5A623) + violet/purple accent colors
- No emojis in UI
- Glassmorphism card style

## Gotchas

- The `X-Meta-Token` header carries the access token — never logged by pino (serializers strip query strings/auth headers)
- Meta Graph API base: `https://graph.facebook.com/v19.0`
- All Meta proxy routes live in `artifacts/api-server/src/routes/meta.ts`
- Frontend calls `/api/meta/*` via relative URLs (proxy routes this through the shared proxy)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
