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
