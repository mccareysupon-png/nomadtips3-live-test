# Combined release stopped at real-data verification

Website Production remains `5667e67f-5854-439e-9e2b-b387b7787d90`.
Engine remains `02e09215-02b1-47fb-b1cf-9423f50c7ce9`.
No Website traffic activation occurred. No Engine upload, Ledger mutation,
provider request, Cron, owner speed, or Bot Fight Mode change was performed.

## Work prepared

- Summary-first frontend: history is read only when Statistics is opened.
- Internal `ball46-statistics-summary-v1` service and independent SQLite Durable
  Object: bounded read-only Engine pages, shared persisted compact summaries.
- The isolated service exists and is active, with workers.dev/previews disabled,
  no routes and no Cron. It is bound only in the inactive Website candidate.
  It is not the active Website release; it runs only on explicit binding reads.
- Four approved WebP images served by the isolated service keep Website module
  upload size at 9,714,301 compressed bytes instead of adding image bytes to it.
- Horizontal Statistics banner in all eight markets and vertical home banner
  immediately below Match Monitor, desktop only, both themes.
- Fixed one Monitor placement condition: it must allow the new banner between
  Monitor and the vote card, otherwise its adjacency repair fights the banner.
  Prediction and score formulas are unchanged.

## Evidence

- Existing UI recorded-data regression: 43 checks passed.
- Combined banner layout/mobile exclusion: 20 checks passed.
- Bounded summary reduction: 10 checks passed on 14,998 recorded rows.
- Real local service runtime: seven checks passed, including four concurrent
  readers sharing one 30-page pass, cached totals on source failure, no provider
  calls, no Engine writes, and the four image byte lengths.
- Test and stage: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43383309841
- Inactive Website candidate: `aaef0441-9c34-44f2-a92c-6b82d076131b`.
- Candidate public assets and images matched expected hashes before the initial
  summary readiness check returned 503. A later browser GET successfully returned
  a fresh LIVE_SUMMARY covering 15,003 rows / 14,724 settled rows. These counts
  are historical observations, not a claim of current totals.
- Real browser: home scores and desktop banner appeared. At 390px both new
  banners were absent. Actual Statistics subsequently failed its source fence:
  `Statistics changed during pagination; refresh required`.

## Blocking condition

The recorded-data test source was stable. The real source updates its metadata
while a visitor traverses 30 cursor pages. The strict source-generation check
correctly rejects a mixed-generation result, leaving Statistics incomplete.
Removing that check or ignoring ledgerUpdatedAt would weaken correctness and
was not done. Do not activate this candidate.

The separate config comparison stop was also diagnosed: Cloudflare /settings
reflects the staged annotation and added STATISTICS_SUMMARY binding/service,
while the active deployment remains the original version. Its diff showed no
changes to Cron, domains, subdomain or original service bindings. Future gates
must compare active-version bindings and allow only the explicitly staged
addition; do not ignore arbitrary configuration drift.

## Required next work

Implement a bounded, immutable history snapshot generation with pinned cursors,
published only after complete-source validation, or an equivalent consistent
read design. Preserve current formulas, all rows and the source-age indication.
Assess storage/CPU and freshness before choosing the implementation. Do not
copy the entire Ledger into RAM, hold an Engine write lock over the read, or
introduce an upstream request. Repeat real-data PC/mobile QA before activation.

## Rollback / current state

No Website rollback is required because traffic never changed. Original Worker
modules are retained byte-for-byte in the inactive candidate. Its new entry and
payload are separate modules. The isolated helper has no scheduled work.
The activation workflow is gated by successful real PC/mobile checks and an
explicit commit marker; no pending release run is active. Its guarded rollback
restores the immediate baseline only if the candidate is still active.

