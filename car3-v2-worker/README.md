# NOMADTIPS3 Car 3 V2

Fresh isolated live-condition engine. It does not import or invoke the legacy Car 3 scanner.

## Architecture

1. Cloudflare Cron wakes the Worker once per minute.
2. A D1 lock prevents overlapping cycles.
3. One `/fixtures?live=all` request gets all live fixtures.
4. Cheap minute/score filters run before statistics or odds.
5. Statistics are fetched with `/fixtures?ids=` in batches of up to 20 fixtures.
6. `/odds/live` is called only when at least one fixture has complete statistics.
7. Momentum/confirmation is computed from D1 snapshots; browsers never call API-Football.
8. Signals are stored in `car3_v2_signals`; Daily Ten runs from 12:00 Asia/Bangkok to 11:59:59 the next day.
9. After 10 signals, new capture stops but pending results continue to settle in fixture-id batches.
10. When no pending results remain, the engine enters `DAILY_SLEEP` until the next 12:00 reset.

## Isolation

All new tables use the `car3_v2_` prefix. Existing Car 3 tables and routes are untouched.
The existing condition configuration is read from D1 `condition_config.active_json` so V2 follows the same owner-selected rules without duplicating browser state.

## API discipline

There is one API gateway module (`src/api.js`). No browser route and no engine module may fetch API-Football directly.
Upstream calls are counted in `car3_v2_api_usage` and exposed at `/v2/status` so actual quota use can be inspected.

## Deployment safety

This directory is intentionally outside the legacy `cloudflare-worker/src/**` deployment path. Building it does not replace or restart the current Car 3 Worker.
Deploy it as the separate Worker `nomadtips3-car3-v2` only after validation and after assigning the `API_FOOTBALL_KEY` secret to that Worker.
