# BALL46 Statistics — Production release STOP — 2026-11-13

**NOT READY FOR PRODUCTION.** Only isolated TEST QA is completed.

Hosted isolated Durable Object QA — GitHub Actions run 43409203595:
- Recorded real Ledger snapshot: 14,998 rows, eight 2,000-row pages.
- An isolated TEST-only Ledger insertion after page one forced HTTP 409 on the stale cursor.
- Restart with fresh generation returned 14,999 unique rows in eight pages.
- **Defect confirmed:** reimporting an unchanged row (inserted=0, updated=0, unchanged=1) nevertheless changed statisticsGeneration (meta.updatedAt): 1794565703923 → 1794565706631. Unnecessary refresh/retry risk.
- No Production writes, no provider requests. Isolated workers.dev disabled.
- Production Engine 02e09215-02b1-47fb-b1cf-9423f50c7ce9 and Website 3ae01f77-9205-4e4b-a46c-3d710aff1602 preserved.

Required gates:
1. Separate monotonically increasing *content revision* from freshness/source-age timestamp; only actual insert/update/delete/repair advances content revision. Audit all Ledger writer paths and preserve current formulas and source-age indication.
2. Pin cursor pagination to content revision. No-op sync must preserve revision; real mutations must return 409; retries must return complete, consistent rows.
3. Run end-to-end pinned Engine + Summary Service + current Website in TEST, including PC/mobile and simulated Ledger writes, source failures, and no-op sync.
4. Verify active bindings, routes, Cron, domains and current banners; do not activate Production without explicit user authorization.

Runs: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43409203595 and https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43408312557
