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
