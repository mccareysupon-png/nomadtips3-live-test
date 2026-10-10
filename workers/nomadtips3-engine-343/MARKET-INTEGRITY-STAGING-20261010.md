# Ball46 — Corners / Goals O-U source integrity (staging only)

**Status: PATCHED ON ISOLATED BRANCH; NOT DEPLOYED TO PRODUCTION.**

Base source: `work/ball46-full-market-20260918` (archived reference code).
Current Production runtime / Worker source identity has **not** been verified. Do not merge or deploy this old worker as-is.

## Scope

- FT Goals Over/Under => verified Bet365 `goal_line.inplay`
- HT Goals Over/Under => verified Bet365 `goal_line_half.inplay`
- FT Corners Over/Under => verified Bet365 `corner_line.inplay`
- HT Corners Over/Under => verified Bet365 `corner_line_half.inplay`
- No aliases, opening, closing, half/full substitutions, or goal_line_fixed.
- Fail closed if Bet365 cannot be identified in `data.bookmakers`.
- Fail closed if latest fixture total missing or `line <= accumulated goals/corners`.
- The existing evidence, price min/max, rolling-window, line-gap and run/stop settings remain unchanged.
- AH, 1X2, Corner Asian Handicap, Cards and BTTS are not modified.

## Changed files

- `src/ou-market-integrity.js`: strict quote source and arithmetic guard.
- `src/index.js`: adds guard to `priceFor`, `pricePass`, marks verified book from full odds payload.
- `test/ou-market-integrity.test.mjs`: representative success/failure cases.

## Testing

Pure JS guard checks: 20/20 passed in an isolated V8 execution (2026-10-10).
Syntax parse of the modified engine: passed.
To repeat the full Node tests on a checkout of this branch:

```bash
node --test workers/nomadtips3-engine-343/test/ou-market-integrity.test.mjs
```

These tests validate guard logic and **do not demonstrate** the live Worker or provider response is correct.

## Remaining release gates (mandatory)

1. Read Cloudflare **active** Worker script/version, the live `/api/engine/registry` and `/api/engine/settings`; identify exact corresponding source. Do not replace Production with this archived branch.
2. Compare a real failed Signal's `fixtureId`, bookmaker, market, period, timestamp, `entryScore`/`entryCorners`, and saved line with the **raw** `/v1/fixtures/{id}/odds?bookmakers=bet365` payload.
3. Verify market tick age and suspension with Ultra `odds/history?market=corner` or `market=goalline`. Full odds API fetch-time is NOT the book's update time. This patch does not prove freshness.
4. Confirm half-time counting, quarter-line settlement, bookmaker identity, absent statistics, and legacy market unchanged in staging.
5. Confirm run/stop settings and scan budget; do not auto-deploy. Obtain an explicit Production deploy instruction before live release.

## Known consequence

With `lineGapMax=0.5`, a bookmaker's legitimate FT Over 4 when current total is 3 will still fail the existing Gap rule of 0.5, as expected. Adjusting any threshold needs a separate review of the **currently saved Production settings**, not a silent change here.
