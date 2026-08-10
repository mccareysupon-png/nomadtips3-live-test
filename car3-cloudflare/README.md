# NOMADTIPS3 — CAR 3 Cloudflare V6

**PAPER ONLY. No real transactions. Isolated from CAR 1 / Production.**

This is the replacement architecture for CAR 3. GitHub stores source; Cloudflare Workers runs the collector. No PC or PowerShell runtime is required.

## Runtime design

- Cloudflare Worker Cron Trigger: every 10 minutes (`*/10 * * * *`).
- First call: `/fixtures?live=all`.
- Local gate: only `2H`, default minute 50–95. First half is ignored.
- Only when second-half fixtures exist: one global `/odds/live?bet=59` call.
- Live bet ID 59 = `Fulltime Result`; live odds are joined locally by `fixture_id`.
- Only fixtures with an eligible Home/Away price are enriched.
- Enrichment uses `/fixtures?ids=...`, max 20 fixture IDs per request, instead of per-match statistics calls.
- Local PAPER rule uses documented statistics only: Shots on Goal, Total Shots, Corner Kicks, Ball Possession.
- Missing data = PASS / no alert.
- SQLite-backed Durable Object stores the latest cycle, recent evaluations, and alert dedup state.
- One state lock prevents overlapping Cron runs.
- LINE push sends one ONLINE health message after the first successful cycle, then PAPER alerts only for newly matched fixtures.

## Required deployment secrets

GitHub Actions passes these to Cloudflare Worker secrets. Do not commit their values.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `API_FOOTBALL_KEY` (workflow also accepts `APISPORTS_KEY` or `API_SPORTS_KEY`)
- `LINE_CHANNEL_ACCESS_TOKEN` (workflow also accepts `LINE_ACCESS_TOKEN`)
- `LINE_TARGET_ID` (workflow also accepts `LINE_USER_ID`)

## Safety / quota

- No browser visitor calls API-Football.
- No per-user API fan-out.
- 429/499/5xx receives at most one retry.
- 204 is treated as valid empty data.
- 401/403 stop the cycle safely.
- PAPER alert is marked sent only after LINE returns success.
- Old CAR 3 V3/V4 code is not used by this Worker.

## Health

The Worker exposes `/health` on its `workers.dev` URL. It returns configuration presence and last-cycle telemetry but never returns secret values.
