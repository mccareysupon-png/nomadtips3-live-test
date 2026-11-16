# BALL46 FAST V1 — Production release hold, 2026-11-16

Owner authorized V1 Production release, but the safety-gated cutover failed before activation. Do not mark this release live.

## Confirmed
- Current expected main Production version immediately before candidate: `828ddb27-bec4-47f8-a41f-fc7469b0152a`.
- Standalone production-read-only snapshot service and dedicated KV successfully provisioned: `b46-stats-fast-v1-snapshot-20261116`, five-minute scheduled refresh. It has no routing or authority to change original engine, ledger or site.
- Candidate validation run [43872558038](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43872558038) PASSED PC/mobile default, 33 pagination calls, full 16,094-row Ledger parity, AH and injected 503. This was an inactive candidate.
- Owner-approved activation attempt [43872942860](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43872942860) FAILED at inactive candidate browser AH deep-link test (waitForFunction 100,000ms). Output stated `activated:false`, `rolledBack:false`, candidate `4b5a739e-940d-4e9a-830a-d18da3d1fa02`, baseline `828ddb27-bec4-47f8-a41f-fc7469b0152a`. No primary site Worker cutover attempted. Previous activation run 43871478259 also stopped before activation because original source returned intermittent 599 / changed revision during paginated scan.
- Updated Production candidate JS loader to ignore clock-only ledgerUpdatedAt churn and to verify cursor pages with bounded retries while keeping original formula/count checks. It passed one candidate run but source intermittent failures remain when testing deeply filtered AH.

## Mandatory next release gate
1. Recheck Cloudflare active Production version and ENGINE bindings.
2. Stop requiring the flaky mutable live cursor feed to complete before a user can see a correct filtered view; implement a fully verified, immutable historical fallback in dedicated production V1 readcache, or another reliable consistent source, then test 599/revision/503/AH and all filters.
3. Keep source-version/hash, revision, ledger counts, market variants and 7D/30D/90D parity safeguards. Never display a changed ledger as "live" from old saved data.
4. Run candidate QA consistently, then activate with existing automatic rollback to the verified baseline and check live PC/mobile.
5. No Production main Worker, Engine, original Production KV, or Ledger edits until tests pass.

State: **HOLD — NO MAIN PRODUCTION V1 DEPLOY**. Owner-approved auxiliary snapshot service alone is live and isolated.
