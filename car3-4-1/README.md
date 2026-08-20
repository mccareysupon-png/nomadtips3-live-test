# CAR 3.4.1 — Isolated Full Stack

CAR 3.4.1 is rebuilt **body-first, then source, then engine**, with each runtime deployed independently so a visual edit cannot silently redeploy or mutate the football engine.

## Architecture

CAR 3.4.1 has three independent runtime units:

1. **Preview UI** — `nomadtips3-car341-preview`
   - static files from `web/`
   - Live, Statistics, Settings, Line alerts, User guide, History, Privacy Policy, Terms of Service
   - certificate/trust footer, mobile bottom navigation, responsive layout, Stripe membership presentation, favicon and football pitch asset
   - UI changes deploy only this Worker

2. **Goaloo Source Monitor** — `nomadtips3-car341-source-monitor`
   - read-only and stateless
   - Goaloo primary + alternate index
   - bounded response sizes and detail concurrency
   - `nomadtips3.live-match.v1` normalizer
   - explicit quality/warnings
   - routes: `/health`, `/config`, `/source-health`, `/fixtures`, `/live`
   - no price key, detector, signal lock, history state, settlement, Durable Object or cron

3. **CAR 3.4.1 Engine** — `nomadtips3-car341-engine`
   - consumes Source Monitor through Cloudflare Service Binding `SOURCE`
   - isolated SQLite Durable Object `CAR341_STATE` / `Car341State`
   - 1xBet real Asian Handicap pricing through Odds-API.io
   - detector gates and one-round confirmation
   - persistent locked signals and history
   - BET365_V4 in-play AH settlement using post-entry score and quarter-line stake split
   - automatic two-minute scan plus manual `/scan`

No CAR 3.4 or CAR 3.5 Worker state, Durable Object or deployment path is reused.

## Detector contract

Default/locked behavior:
- selected side: HOME
- minute: 54–89
- market: AH only
- selected-team AH minimum: +1.00
- odds minimum: 1.40
- real-market max age: 120 seconds
- Goaloo source freshness: 90 seconds
- minimum match/mapping confidence: 85%
- momentum minimum: 54%
- attack evidence: enabled, need at least 1 enabled delta
- dangerous attacks / shots / shots on target / corners: enabled, minimum +1 each
- complete core statistics required
- goal-gap limit: off
- red-card policy: ALLOW
- confirmation rounds: locked to 1
- daily signal limit: off

The final signal requires both football-side gates and real-market gates. A 1xBet event mapping below the configured confidence threshold cannot create a signal even when an AH price is present.

## Data and price sources

- **Goaloo**: match identity, score, minute/state, cards and live core statistics.
- **Odds-API.io / 1xBet**: executable real Asian Handicap line and decimal odds.
- Goaloo AH/O-U fields are retained only as source market hints and never substitute for the 1xBet price gate.

## Signal record

A locked signal preserves:
- match and selected team/side
- detection timestamp and Bangkok selection date
- entry minute and entry score
- selected-team AH and raw home-perspective line
- locked 1xBet odds
- bookmaker/pricing source
- odds event id and update timestamp
- market age
- Goaloo-to-1xBet mapping confidence
- momentum and evidence deltas
- settlement state and final score when available

## Settlement

AH settlement contract is `BET365_V4`:
- in-play AH ignores goals scored before entry
- entry score is mandatory; missing entry score = VOID
- selected-team line perspective is stored explicitly
- quarter lines split the stake 50/50
- exact outcomes: FULL_WIN / HALF_WIN / PUSH / HALF_LOSS / FULL_LOSS
- public result groups: WIN / DRAW / LOSS / VOID / PENDING
- net units retained per record

The Source Monitor `/fixtures` route provides finished match status and final score for settlement without loading full detail pages.

## UI runtime behavior

`web/runtime.json` points only to CAR 3.4.1 endpoints.

Live page uses explicit tiers:
1. `FULL ENGINE` — Goaloo + detector + 1xBet price + locked signals.
2. `SOURCE ONLY` — Goaloo is online but Engine is unavailable; no fake price/signal is shown.
3. `MOCK FALLBACK` — both runtime services are unavailable; the page clearly labels the data as non-live.

Statistics and History read the persistent Engine ledger and paginate 25 records per page. They do not present sample results as verified history when the Engine is offline.

Settings reads/writes `/config` when the Engine is available. If the Engine cannot be reached, it visibly falls back to browser-local storage instead of pretending the engine was changed.

## Deployment isolation

- `.github/workflows/car341-preview-deploy.yml` — only `web/**` + `preview/**`
- `.github/workflows/car341-source-deploy.yml` — only `worker/**`
- `.github/workflows/car341-engine-deploy.yml` — only `engine/**`
- `.github/workflows/car341-source-check.yml` — source tests/dry-run only

The Engine deployment is gated on a healthy Source Worker and requires a repository `ODDS_API_KEY`. The deployment workflow installs that secret only on `nomadtips3-car341-engine`.

## Target URLs

- Preview: `https://nomadtips3-car341-preview.mccarey-supon.workers.dev/index.html`
- Source: `https://nomadtips3-car341-source-monitor.mccarey-supon.workers.dev`
- Engine: `https://nomadtips3-car341-engine.mccarey-supon.workers.dev`

## Verification rule

Code completeness and live deployment are separate facts. CAR 3.4.1 is considered runtime-ready only after its isolated workflows pass and the deployed endpoints show current timestamps/data. Never infer deployment success merely from a committed workflow.
