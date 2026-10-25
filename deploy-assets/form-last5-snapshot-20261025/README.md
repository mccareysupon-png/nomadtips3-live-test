# Last 5 — Preloaded JSON snapshot candidate (NOT DEPLOYED)

Production registry #366: current at investigation time `15607595-5930-4093-8e9e-e64c52d9f120`. Work completed Issue #368 but expand calls `/api/form-last5` and can synchronously wait ~15 seconds between two provider team requests on cold misses. This prototype moves the viewer to preloaded immutable JSON.

## Integration prerequisite — do not skip
1. Identify the existing authoritative completed-FT feed/ledger and its actual team IDs. Confirm it retains historic FT match rows (not just selected betting events); otherwise arrange a bounded *offline* 5USD backfill. Do **not** silently call 5USD at user click.
2. At the existing scheduled data refresh, call `buildLast5Snapshot(board.fixtures, verifiedFtRecords)`. Publish a snapshot atomically alongside the same board revision and deliver it in the initial page/board JSON response.
3. Populate `window.__B46_LAST5_SNAPSHOT__` from that preloaded JSON BEFORE loading `snapshot-browser.js`. Do not inject untrusted JSON as inline executable text; use safe JSON serialization or external same-origin JSON.
4. Replace only the original Last5 browser module, not Vote V9, card layout, Sidebar, Engine, Statistics, or Members. Keep existing `history.css` scoped styling.
5. Validate that both teams' IDs and cutoff UTC are from the same authoritative board snapshot. Stored FT rows can be less than 5; display true partial results.
6. Preview QA: zero network requests upon clicking View/Hide repeatedly, switching fixtures, and revisiting; full/partial/empty; WDL/scores/dates and responsive PC/mobile; protection of 6 existing APIs, Vote and 12 jerseys. Enforce production-version guard, then update Issue #366/#368 with proofs on successful authorized deploy.

## Limitation
This is a standalone, non-deployed candidate; existing stored FT dataset has not been confirmed to include whole-team fixture histories. It must not replace the actual production path until data coverage and integration have been independently verified.


## John Ellis email findings (Gmail thread, 9 Sep–5 Oct 2026)
- One HTTP call counts as one request regardless of returned fixture count. For LIVE matches only, `GET /v1/fixtures?status=live&include=odds,events,stats&per_page=500` is a bulk endpoint. Do not assume that same endpoint provides full historical Last 5.
- Pro plan: 10 requests per 60-second *fixed window*, per account and shared among ALL keys/services; Ultra: 40/min. Plan and live usage must be checked before allocating history request budget.
- HTTP 429 is *always* provider account rate limiting, not bookmaker/market freshness. Obey `Retry-After` and successful response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Maintain centralized accounting across all BALL46 workers.
- Null/missing provider stats mean no coverage, not zero. Inplay odds can be last recorded tick: do not infer recency or FT settlement from odds.
- John's correspondence does NOT guarantee a historical bulk/team history endpoint or general plan entitlements. Validate before deciding on any backfill.

## Read-only audit gates BEFORE integrating
1. Identify owner and schedule of current 5USD bulk poll, the authoritative board, and the stored FT ledger. Check whether FT ledger records *all fixtures* with team IDs and finals, not only betting picks. Measure last-five completeness on a representative sampling of selected fixtures and leagues.
2. Measure shared-account request consumption, latest rate-limit headers and 429 patterns across ALL 5USD clients. Separate request counts for live bulk, odds per-match, and history per-team. Avoid adding concurrent history on top of existing live bursts.
3. Preload only immutable finished-history data. If coverage is incomplete, schedule priority backfill outside critical live polling windows and dedupe by team ID, as budget allows. A fixed 15s local throttle is NOT a replacement for shared-account budget.
4. Partition history by team ID and kickoff cutoffs; no leakage of future matches into pre-match Last 5. Snapshot must remain consistent with selected fixture board revision.
5. Build snapshot once per refresh cycle from durable history. Serve snapshot from storage/cached board; click to expand = zero network calls. New fixtures can use next snapshot refresh; show actual partial/empty coverage without blocking.
6. Protect service keys, Vote, Sidebar, Engine343, Signals, Member, and all existing stats. Snapshot candidate remains detached from Production.

## Approval gates
A. Read-only source inventory and completeness report, B. request budget and backfill plan, C. integration on isolated branch, D. preview QA with browser network proof zero Last5 calls on click, E. user approval BEFORE Production deploy. No workflow activation or deploy until explicit separate instruction.
