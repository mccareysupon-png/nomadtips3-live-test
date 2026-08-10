# CAR 3 V5 — PAPER Live Condition Collector

Status: **isolated rebuild / PAPER ONLY**

This directory is a clean replacement candidate for the old CAR 3 scanner. It does not depend on the old V3/V4 runtime and it must not write to Production.

## Design decision

API-Football's own guidance favors a centralized server-side fetcher, caching, avoiding duplicate calls, and using `fixtures?ids=` to retrieve several fixtures at once. CAR 3 V5 follows that model.

### Scan pipeline

1. **Global discovery — 1 call**
   - `GET /fixtures?live=all`
   - Keep only `2H` fixtures in the configured minute window (default 50–95).
   - First half is ignored.

2. **Global in-play 1X2 — 1 call**
   - `GET /odds/live?bet=59`
   - Live bet id `59` is **Fulltime Result**.
   - Pre-match bet IDs are never mixed with live bet IDs.
   - Blocked, stopped, finished, or suspended odds are ignored.
   - Live odds are normalized and joined locally by `fixture_id`.

3. **Bulk details/statistics — ceil(second_half_fixtures / 20) calls**
   - `GET /fixtures?ids=ID-ID-ID...`
   - API-Football supports up to 20 fixture IDs per call and returns embedded events, lineups, fixture statistics, and player fixture data.
   - CAR 3 reads the embedded `statistics` object and does **not** call `/fixtures/statistics` once per match.

4. **Local rule engine**
   - All filtering after collection happens locally.
   - Default PAPER rule uses Shots on Goal, Total Shots, Corner Kicks, Ball Possession, and Fulltime Result live odds.
   - Missing data = PASS / no alert. Never invent a metric.
   - `Dangerous Attacks` is not used because it is not one of API-Football's documented fixture statistics.

5. **Persist once, read many**
   - SQLite stores every evaluated snapshot and PAPER alert.
   - This is essential because API-Football does not retain live-odds history after a fixture leaves `/odds/live`.
   - Future website/member views must read CAR 3's local/API layer, not call API-Football directly per visitor.

## Why this should use far less quota

Default schedule: one scan every **10 minutes**.

Calls per cycle:

`1 live fixtures + 1 live odds + ceil(second-half fixtures / 20)`

Examples:

- 0 second-half matches: 1–2 calls/cycle
- 20 second-half matches: 3 calls/cycle
- 60 second-half matches: 5 calls/cycle
- 200 second-half matches: 12 calls/cycle

At 144 cycles/day, even 200 second-half fixtures every single cycle would be ~1,728 calls/day before rare retries — far below an Ultra daily allowance. Real traffic should normally be much lower.

## Safety

- PAPER ONLY.
- No real transactions.
- API key from `API_FOOTBALL_KEY` environment only.
- One-process lock prevents duplicate CAR 3 workers.
- Local rate guard is intentionally below Ultra ceilings: 4 req/s and 240 req/min by default.
- 204 = valid empty response.
- 400/404/422 are not retried.
- 429 pauses instead of hammering the API.
- 499/5xx/transport errors get at most one retry.
- Missing odds or statistics never produce an alert.

## Files

- `scanner.py` — collector, local rule engine, storage, rate guard.
- `test_scanner.py` — offline unit tests, no API key required.
- `requirements.txt` — Python dependency.

## Current PAPER rule defaults

These are deliberately configuration values, not hard-coded product logic:

- minute window: 50–95
- live market: Fulltime Result (`live bet id 59`)
- minimum 1X2 odds: 1.50
- Shots on Goal >= 3
- Total Shots >= 8
- Corner Kicks >= 4
- Ball Possession >= 55%

The rule layer can be replaced later without redesigning the collector.

## Source material reviewed

Official API-Football / API-SPORTS material:

- API-Football v3.9.3 documentation
- Odds (In-Play): `/odds/live`
- Live bet reference: `/odds/live/bets`
- Fixtures: `/fixtures?live=all` and `/fixtures?ids=...`
- Fixture statistics coverage and update frequency
- Coverage page and `/leagues` coverage guidance
- HOW TO OPTIMIZE API-SPORTS CALLS AND QUOTA USAGE (2026-07-27)
- HOW RATELIMIT WORKS (2026-06-12)
- HOW TO GET STARTED WITH API-FOOTBALL: THE COMPLETE BEGINNER'S GUIDE (2026-03-13)
- API-Football pricing / Ultra quota
- API-Football user-project examples

## Replacement plan

Do **not** delete the old CAR 3 yet.

1. Keep old CAR 3 stopped.
2. Build and test V5 in this isolated directory.
3. Run PAPER field validation.
4. Compare quota, coverage, candidate count, and missed data.
5. Only after V5 passes, archive/remove the old CAR 3 implementation.
