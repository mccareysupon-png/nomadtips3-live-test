# CAR 3.4.1 — Body First, Engine in Layers

CAR 3.4.1 is intentionally rebuilt **body-first / engine-in-layers** so presentation work cannot silently redeploy or mutate the live engine.

## Phase 1 — UI shell

The user-facing structure is rebuilt from `car3-4-real-market-audit/web/` (CAR 3.4): Live, Statistics, Settings, Line alerts, User guide, History, Privacy Policy, Terms of Service, certificate/trust footer, mobile bottom navigation, responsive layout, Stripe membership presentation, favicon and the football-pitch visual language.

Current UI behavior remains deliberately local:
- `web/mock-app.js` supplies sample matches, signals, history and statistics.
- Settings are stored only in browser `localStorage` under `car341-mock-config`.
- The UI does not call a Worker yet.
- The CAR 3.4 pitch image is copied into `web/assets/nomadtips3-live-pitch.webp` so CAR 3.4.1 does not depend on CAR 3.4 static paths.

## Phase 2 — Goaloo source monitor

A completely new Worker source layer now exists under `worker/`.

It is intentionally read-only and stateless:
- Goaloo primary + alternate live index adapter
- bounded source response sizes
- bounded match-detail concurrency
- match-detail hydration
- source-independent `nomadtips3.live-match.v1` normalizer
- explicit quality/warning output
- `/health`
- `/config`
- `/source-health`
- `/live`
- structured Worker logs / observability

The detailed source contract and acceptance gates are in `worker/SOURCE-CONTRACT.md`.

### Hard boundary in Phase 2

The new Worker has **no**:
- CAR 3.4 Worker import, URL or binding
- Durable Object / KV / D1 / R2
- cron trigger
- Odds-API.io / 1xBet request
- pricing key
- momentum calculation
- detector gate
- locked signal
- history mutation
- settlement

Goaloo Asian Handicap / O-U values can appear only as `sourceMarketHints`; they are not executable pricing and must never replace 1xBet real-market data.

## Planned engine sequence

Do not skip layers:
1. **UI shell** — complete.
2. **Goaloo source + Normalizer** — implemented, awaiting deployed source validation.
3. **1xBet real AH through Odds-API.io** — only after source acceptance gates pass.
4. **Detector gates** — only after Goaloo + pricing freshness are both proven.
5. **Locked-signal record / history persistence**.
6. **Settlement**.
7. **Cron + persistent health monitoring** after the scan path is stable.
8. **Connect UI to the proven Worker** last.

## Current UI pages

- `web/index.html` — Live match center (mock)
- `web/statistics.html` — Statistics ledger (mock)
- `web/settings.html` — Detection settings (browser-local only)
- `web/line-alerts.html` — Line/Stripe presentation; alert service is not queried
- `web/user-guide.html` — User guide
- `web/history.html` — historical statistics view (mock)
- `web/privacy-policy.html` — Privacy Policy
- `web/terms-of-service.html` — Terms of Service

## Validation

`.github/workflows/car341-source-check.yml` is isolated to the CAR 3.4.1 branch/source tree and performs:
- Node parser regression tests
- JavaScript syntax checks
- Wrangler deploy dry-run

It does **not** deploy the Worker.

## Rule

A later layer may consume an earlier layer only after that earlier layer has been independently proven. Never use a UI change as a Worker deployment trigger.
