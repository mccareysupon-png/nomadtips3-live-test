# BALL46 GPT Chat — Incremental Statistics V1

Owner: ChatGPT chat workflow. Git branch: `chatgpt/ball46-statistics-v1`. Repository: `mccareysupon-png/nomadtips3-live-test`.

## Rules

1. All changes stay in `chatgpt-statistics/` or its dedicated workflow. Never edit active BALL46 Production workers, routes, domains, existing statistics, Engine or Member.
2. Engine settles each real signal/pick once. A new result adds to saved totals; a corrected result subtracts its previous contribution and adds the corrected contribution. Exact replay changes nothing.
3. Persist daily and global read-model buckets. Summary and charts read those buckets without recalculating historical ledger rows.
4. Keep original ledger rows for display/audit only. One-time baseline import may read history; routine updates require real settlement events or a verified delta API. Do NOT repeatedly fetch all history.
5. Use the existing London 06:00 sport-day boundary. HALF_WIN counts as WIN, HALF_LOSS as LOSS; PENDING updates when settled. Do not infer P/L or ROI unless the real source supplies a verified profit value and unit.
6. Use real BALL46 data for integration/parity evidence; technical unit tests alone do not prove real-result correctness. Unobserved real corrections must be reported NOT VERIFIED.

## Cloudflare staging deployment

Staging Worker name: `ball46-chat-statistics-staging` (dedicated workers.dev hostname); staging D1 database: `ball46-chat-statistics-staging-db`; **never bind production D1**. The deployment workflow is guarded by separately provisioned GitHub secrets `B46_CHAT_CF_API_TOKEN`, `B46_CHAT_CF_ACCOUNT_ID`, and `B46_CHAT_STAGING_D1_ID`. Without them, automatic deployment must skip. The staging-only `STAGING_WRITE_TOKEN` must be configured separately as a Worker secret. No production deploy without a new explicit authorization.

## Acceptance

- Idempotent genuine signal rows.
- Correct old-result reversal plus new-result contribution for a genuine correction.
- Today's and prior days' buckets plus global/market counts consistent with Engine and ledger.
- Fast read API without full-ledger scans; incomplete profit shown as unknown, not zero.
- No modification to Production.

## Current evidence (2026-11-15)

Git branch created and isolated. Real Production API has not been successfully read through the current chat connection. No confirmed staging D1/database bindings. Real event/correction verification is pending. No Production changes.
