# CAR 3.4 — Real Market AH Audit

CAR 3.4 is an isolated shadow experiment derived from CAR 3.1. It tests the same live-stat/momentum/evidence logic against a real bookmaker Asian Handicap price source instead of using Goaloo odds.

## Architecture

- Goaloo: live match, score and core live statistics.
- Odds-API.io / 1xbet: live Asian Handicap line and decimal odds only.
- CAR 3.1 detection gates: minute, core stats, momentum, attack evidence, goal gap, red-card policy, confidence and confirmation streak.
- Bet365 V4 settlement: existing in-play AH settlement contract, including quarter-line split settlement.

The two feeds are joined by a match mapper using home team, away team, league and kickoff evidence. If a real-market event or AH line is not matched, the match is `NOT_FOUND/NO_AH` and cannot create a signal. There is no fallback to Goaloo odds.

## Runtime safety

- Shadow/read-only. No bet execution.
- AH market is locked.
- 1xbet price is locked at detection and recorded with source event ID, update time, market age and mapping confidence.
- Cron runs every 2 minutes.
- Real-market odds are fetched in one batch for up to 10 mapped candidate events per cycle.
- `ODDS_API_KEY` must be configured as a Cloudflare Worker secret; it is never exposed to the browser.
- Without the key, health remains online but `realMarketPipe.status = KEY_MISSING` and no signals can be created.

## Pages

1. `web/index.html` — Detector
2. `web/statistics.html` — Statistics
3. `web/settings.html` — Settings

Worker: `nomadtips3-car34-real-market-audit`
