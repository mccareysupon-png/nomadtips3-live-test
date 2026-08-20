# CAR 3.4.1 — UI Shell First

CAR 3.4.1 is intentionally built **body-first / engine-later**.

## Source of presentation
The user-facing structure is rebuilt from `car3-4-real-market-audit/web/` (CAR 3.4): Live, Statistics, Settings, Line alerts, User guide, History, Privacy Policy, Terms of Service, certificate/trust footer, mobile bottom navigation, responsive layout, Stripe membership presentation, and the football-pitch visual language.

## Hard isolation boundary
This version does **not** import, call, or deploy CAR 3.4 Worker code. The UI shell must not depend on:
- CAR 3.4 Worker URLs
- `/health`, `/live`, `/config`, `/scan`
- Goaloo network requests
- Odds-API.io / 1xBet network requests
- cron triggers
- Durable Objects
- detector logic
- settlement logic
- runtime state from CAR 3.4

`web/mock-app.js` supplies sample match, signal, history and statistics data locally. Settings are stored only in browser `localStorage` under `car341-mock-config`.

## Intended engine sources for the next phase
When the user approves the UI shell, the new engine will be connected in layers:
1. Goaloo — live matches, score, minute, events and core match statistics.
2. Normalizer — a clean internal match schema independent of source page structure.
3. 1xBet real Asian Handicap market through Odds-API.io — AH line, odds and market timestamp.
4. Detector gates — connected only after source/freshness monitoring is proven.
5. Locked-signal record and history.
6. Settlement.
7. Cron/health monitoring.

## Current UI pages
- `web/index.html` — Live match center (mock)
- `web/statistics.html` — Statistics ledger (mock)
- `web/settings.html` — Detection settings (browser-local only)
- `web/line-alerts.html` — Line/Stripe presentation; alert service is not queried
- `web/user-guide.html` — User guide
- `web/history.html` — historical statistics view (mock)
- `web/privacy-policy.html` — Privacy Policy
- `web/terms-of-service.html` — Terms of Service

## Static assets
The CAR 3.4 pitch image has been copied into `web/assets/nomadtips3-live-pitch.webp`, and the Live page explicitly uses that local CAR 3.4.1 asset. No runtime asset is required from CAR 3.4.

## Rule for this phase
Do not connect any engine until the UI is reviewed and explicitly approved as complete.
