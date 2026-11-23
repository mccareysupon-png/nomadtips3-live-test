# BALL46 Pre-Match O/U V2 — Detection & Settlement Handoff
Date: 2026-11-23 (TEST only)

## Owner decision (frozen)
Keep all selection thresholds unchanged until real settled results have accumulated. Do not loosen/tighten the mathematical selection policy or model. No Production rollout authorized.

## Data flow
1. NOMADTIPS3 5USD HUB Bulk updates cached fixture board independently (configured 10s refresh; actual completed refresh may be slower).
2. Existing PreMatch TEST Worker Cron `*/15 * * * *` starts with the daily mission/HUB history sync. The O/U V2 worker then reads `HUB /snapshot`. The tested order is mission before O/U.
3. Persistent guard requires healthy fresh `cacheOnly` HUB snapshot with `fetchedAt` within 120 seconds, greater than last successfully processed HUB timestamp. No new O/U selection from stale or duplicate snapshots.
4. O/U engine chooses Scheduled/Upcoming/Waiting pre-kickoff fixtures, batch max 350 per tick, round-robin cursor. History model uses existing FT archive; DO NOT modify criteria.
5. Prefer `FULL_MARKET /board-cache` (zero upstream calls) for priced Asian O/U quotes. Only if modeled candidates lack usable quotes, optional `/fixture-odds?fixtureId=...` uses existing guarded Full Market service. Current cap: at most one new quote request per tick and four shared O/U reservations per London business day, with health/rate-limit gates and no retry of a reserved fixture. These caps are not an atomic account-wide 5USD quota reservation.
6. Pick requires authentic bookmaker O/U price >1.50 and Asian exact settlement-based EV >=0.05. Preserve source, bookmaker, line, observed timestamp, probability, immutable locked price in `b46_ou_value_v2_shadow_test`.
7. Only V2 is an automatic O/U PRICE ISSUER on the 15m TEST Cron. The older `/ou-cycle-test` route is retained for compatibility but no longer automatically issued by Cron. Old O/U V1 ledger and its FT settlement are preserved.
8. O/U V2 settlement runs on V2 engine cycle, independently from price selection, from **cached confirmed FT HUB fixture** or `result_version` existing archive. No 5USD call. It validates status FULL, team IDs, pre-kickoff pick, source timestamp; if no verified FT, remain PENDING.
9. `b46_ou_v2_settlement_test` records the first verified result once. Full/half WIN or LOSS or PUSH uses original Asian line and odds, one-unit P/L. Half WIN/LOSS count as one in Win Rate but use actual half P/L. Source prediction is immutable.
10. `b46_ou_v2_event_test`, `b46_ou_v2_snapshot_test`, and `b46_ou_v2_daily_test` store incremental settled stats and London-day totals. Existing PreMatch O/U UI reads snapshots; no historical ledger regrade on each page view.

## Public and owner surfaces
- Existing TEST UI: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou`
- Existing TEST Predictions: `?b46pm=predictions`
- TEST owner-state GET `/prematch-ou-engine-state`
- TEST owner-state GET `/ou-v2-settlement-state`
- TEST owner-only no-provider POST `/ou-v2-settlement-tick`
- V2 main shadow source `ou-v2-settlement-test.mjs`

## Evidence
- HUB Bulk verification: GitHub Actions 45196482823 (configured 10s; observed fetchedAt moved ~30s)
- Bulk-first O/U worker: 45197831592 and 45198038426
- O/U V2 FT settlement pure tests: 45200595626 (5/5 settlement, 12/12 original engine, 6/6 projection)
- Real TEST settlement integration: 45201599748
- Real postdeploy GET/POST settlement and price immutability: 45201841525
- Single priced O/U issuer (disable redundant legacy cron only): 45202616112
- Current TEST worker version at final step: `6589efe8-9300-4309-8022-eb4a296442c6`
- Original genuine priced fixture: `204906152`, Neftchi Fargona v Al Hilal Riyadh, UNDER 2.5 @ 2.80 Ladbrokes, recorded in V2 shadow ledger.
- No additional 5USD calls from deployment/offline QA/settlement owner tick.

## Outstanding runtime acceptance
- The sample fixture was still PENDING at the last settlement check: no verified FT available yet. Test the actual PENDING -> WIN/LOSS/PUSH transition after reliable FT exists; do not fake an FT.
- Keep an eye on O/U selection coverage, provider call counters, zero-source cache hits, historical availability and end-to-end timeline; use status/metrics to decide scheduling, not changed selection thresholds.
- Do not assert real-world win rate until enough settled picks accumulate. Production and Live unchanged.
