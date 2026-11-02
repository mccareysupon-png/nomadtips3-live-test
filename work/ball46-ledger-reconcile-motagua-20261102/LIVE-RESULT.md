# Deploy Motagua duplicate repair — verified Production

- Engine active version: `02e09215-02b1-47fb-b1cf-9423f50c7ce9`
- Deployment: `77b9e330-7dde-4350-9178-20aea667cd1d`
- Source commit: `5d09a644af7cd1d6d3a9da0a885de2531203ce19`
- Actions: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41414818206
- Verified at: 2026-11-02T08:45:11.272Z
- Inactive compensating restore version: `d46bad0a-fda7-4f90-b589-07e5b42ac22d`
- Baseline rollback code version: `1f2336fa-7b45-4a23-a23c-06d01a92330d`

## Verified outcome

Motagua — CD Marathon has one active Ledger row, `203745645-ft_ah-mvyiwh1q`, SETTLED / PUSH. Duplicate `203745645-ft_ah-mvyiwfq7` is retained in a reversible journal with its original full row and SHA256. Journal state APPLIED; archiveRetained true.

Ledger total 12491 → 12490; pending 276 → 275. All 12215 pre-existing settled rows preserved. No additional signals created during comparison. Canonical public row identical to baseline; all other baseline IDs retained.

49 live-referenced static assets: HTTP 200 and byte hashes unchanged. Website, HUB, Full Market and Member active versions/deployment IDs unchanged. Engine bindings/settings/Cron unchanged (upload provenance annotations excluded). Engine health ok, lastError null.

Desktop live browser after reload: Total 12490; exactly one Motagua row with PUSH, ENTRY 55′, Away 0 @1.88 Pinnacle, entry 2–0 / score 2–0. Browser console error list empty. Production statistics tab left open for owner review.

30 tests (24 VM + 6 workerd) passed again before activation. No direct provider request added by repair, tests or verification. Existing normal scan applies the migration. The separate 5USD speed investigation is paused per owner instruction.

## Rollback

Do not restore only code while journal APPLIED and call data restored. Activate the prepared compensating restore version, wait for normal Cron and journal RESTORED, verify original duplicate row/hash and canonical PUSH, then restore baseline Engine code if needed. Increment counters against current meta; never overwrite current meta with an old snapshot. No rollback was necessary in this successful deployment.

Detailed sanitized deployment record: [production-deployment.json](evidence/production-deployment.json).
