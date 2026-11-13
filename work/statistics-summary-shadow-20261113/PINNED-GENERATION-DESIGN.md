# TEST DESIGN — pinned-generation statistics cursor v1

Goal: preserve correctness while reducing real-data pagination failures.

Protocol:
1. First bounded read uses cursor=stat:v2:row:\uffff and limit=2000.
2. Engine response includes statisticsGeneration = ledgerUpdatedAt.
3. Every continuation request includes generation=<statisticsGeneration>&limit=2000.
4. Engine reads meta before page; if generation mismatches, return HTTP 409 STATISTICS_GENERATION_CHANGED before reading rows.
5. Engine reads one bounded page (max 2000 + 1 storage rows), then re-reads meta. If generation changed during that page, return HTTP 409.
6. Client/summary reducer discards the attempt and retries from the first cursor with a small bounded retry count.
7. Existing full-source count/market checks remain. No fence is removed.
8. No provider call, no Ledger write, no Cron change, no Production activation.

Why this is safer than removing SOURCE_CHANGED:
- mixed generations are never accepted;
- conflict is detected page-by-page instead of after all pages;
- larger bounded pages reduce ~30 HTTP round trips to ~8 at ~15k rows;
- memory remains bounded to one page, not the entire Ledger;
- writers are not locked during the reader.

Production remains untouched until real-data PC/mobile tests pass.

QA progression: run full summary-service and PC/mobile replay before any stage.

Current Website drift detected; refresh UI capture before further browser QA.

QA uses current Website capture plus recorded full Ledger dataset.

Current membership banners are preserved byte-for-byte; final QA patches Statistics only.

Authorized real-data smoke: inactive Engine version only; temporary 0% deployment for override testing; restore baseline after test.

Retry inactive candidate after strict secret-binding inheritance correction.

Retry inactive Engine candidate using explicit baseline version inheritance through Workers Beta Versions API.

Final smoke retry reuses exact inactive candidate by SHA and validates binding shape before 0% override test.

Probe direct Engine workers.dev availability read-only before another 0% candidate smoke.

Final real-data smoke uses direct Engine workers.dev with version override; reuse exact inactive candidate; restore baseline after 0% test.

Hosted isolation QA: separate Worker + separate Durable Object, import recorded real Ledger snapshot, no scan/Cron/provider, disable workers.dev after test.

Retry hosted isolation after workers.dev readiness polling; reuse only empty isolated DO and import in 3k chunks.

Additional isolated hosted QA: mutate cloned Ledger between page one and continuation, require 409, then retry fresh generation; record if no-op sync changes ledgerUpdatedAt. No Production release.
