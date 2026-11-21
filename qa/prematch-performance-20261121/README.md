# BALL46 Pre-Match 1X2 — long-term performance (TEST ONLY)

## User-facing layout
- Original BALL46 Membership banner remains pinned above Pre-Match scrolling.
- Pre-Match Predictions keeps its compact Today / All time counters.
- Pre-Match Statistics (All Matches and 1X2) displays the separate two-column
  long-term performance dashboard, with Net units / ROI / Win rate graph
  and chart ranges 7D, 30D, 90D, ALL.
- Eight result cards: ROI, Win rate, AVG ODDS, Settled days, Unsettled,
  W/D/L, Units used, Max drawdown. BTTS has no ledger data, so shows no
  1X2-derived figures. Neither view copies Live Football stats.

## Exact source and calculation
- **Authoritative source:** Pre-Match immutable signal selection + settlement
  ledger. Never the Live Predictions performance ledger.
- 1 unit fixed nominal stake per settled pick.
- WIN: locked odds - 1; LOSS: -1; PUSH/DRAW: 0.
- HALF WIN: (locked odds - 1) / 2; HALF LOSS: -0.5.
- Win rate: (WIN + HALF WIN) / (WIN + HALF WIN + LOSS + HALF LOSS).
  PUSH/DRAW never enters its denominator. Half decisions count as one event
  for win rate while their P/L remains half units.
- ROI = net settled units / total settled staked units × 100.
- Today AVG ODDS = all Bot-selected locked odds for that day.
- Long-term AVG ODDS = settled selections' locked odds, consistent with Live Statistics.
  Neither may use live-changing prices.
- Daily close: 06:00 Europe/London, respecting daylight saving transitions.
- Live-equivalent Max Drawdown must use the per-settlement equity path.
  The TEST Receiver currently returns null (UI displays —) pending an exact
  event-level writer; it must not substitute daily-close drawdown.
- Unsettled counts pending items and is not included in ROI denominator.
- W/D/L: DRAW represents settlement PUSH/void, **not** a 1X2 bet that
  predicted a drawn match.

## Test-only Receiver is now connected (21 November 2026)
- Independent deployment: `ball46-prematch-performance-test-20261121`.
  Persistent storage: unique SQLite-backed Durable Object class
  `PrematchPerformanceIsolatedDO`, not a production or Live Statistics namespace.
- Sole upstream: **read-only internal** service binding `PREMATCH_STORE` to
  `ball46-prematch-only-test-20261120` via GET `/preview-data`.
  No provider URLs, no Engine API, no live scores writes, no 5USD calls.
- First DO initialization imports only the confirmed TEST_ONLY Ledger.
  Thereafter a scheduled job every 5 minutes checks the same internal test
  data and applies **new selections / final settlement transitions only**.
- Selection identity: 1X2 + fixture + picked_at + selection. Locked price
  and final result are immutable. Retries do not add a second result.
  Conflicting revisions fail closed and require explicit reconciliation.
- Each import atomically persists the projection in its **own** DO state;
  original Pre-Match Ledger remains unchanged. The persisted sequence is
  monotonic; current verified initial state was 8 picks, 4 settled, 4 pending,
  +4.70 U, sequence 12, one London daily close.
- Receiver GET `/graph?market=1X2&variant=all&filter=all&range=all|d7|d30|d90`
  serves the Live-compatible `schema:1, source:RECEIVER, sequence, summary,
  counts, series.units/roi/rate` response from stored daily Snapshot,
  **not** from a history scan. Browser fetches only selected ranges and
  keeps valid results briefly.
- Existing Premium Pre-Match test Worker GET route
  `/__b46_prematch_graph` proxies strictly to this independent test Receiver;
  the current `/__b46_prematch_data` and every Production route remain
  untouched. External POST is blocked.
- QA: isolated Receiver deploy/smoke
  `44869135663`; browser integration/refresh/active/scroll/odds QA
  `44869309898`. Browser-only multi-day fixtures do not write to storage.

## Scope limits before any Production proposal
- This proves a **separate eventual-consistency test projection**, not
  atomic hooking into the actual Production settlement transaction. The
  test importer reads a TEST_ONLY preview on a 5-minute cadence.
- The available test Ledger contains **one day's** 8 test selections;
  longer chart history must accumulate from genuine later test decisions.
  Never fabricate historical settled days or mix Live results with Pre-Match.
- The current 1X2 test Snapshot stores a compact rollup and selection
  idempotency map in one DO state value. Before a high-volume/long-term
  production rollout, partition historical daily rows and selection IDs
  into dedicated SQLite records and test retention, late revisions, recovery
  and failover on real write-side sequences.
- Max Drawdown remains unavailable until an exact settled-equity-path
  measure is stored. A Daily Max Drawdown number is not interchangeable.
- A production settlement-writer integration, with outbox, unique
  `(market,signal_id,transition)` keys and atomic persist, has **not** been
  enabled; it must be separately reviewed, authorised and tested.
- No Production worker, service, Bot selection, 5USD schedule, Live
  Statistics or original Pre-Match TEST source writer was changed.

## Verified against actual Live Statistics Production — 21 Nov 2026
- Read-only audit ran against `https://ball46.com/longterm-performance-343.js`
  and the live `/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all`.
- Latest Live graph is **receiver-first**. The browser validates
  `ok:true,source:'RECEIVER',schema:1`, exact echoed market/variant/filter/range,
  integer `sequence`, summary and daily `series.units/roi/rate` points
  (`{date:<epoch milliseconds>,value:<number>}`). It reuses valid points
  and caches the current market/range briefly. History loads separately.
- Live keeps a **legacy full-ledger fallback** after receiver errors, which can
  be expensive. Pre-Match deliberately does **not** copy that fallback.
- The graph contract is now represented by `receiverGraph()` and
  `validReceiverGraph()` in the pure Pre-Match staging projection.
- On the browser, `performanceGraphs[market][range]` or `performanceGraph`
  is preferred only when the same Receiver schema and exact query match.
  If absent, show the **honestly limited** stored day rather than fabricating
  90 days of history or loading a bulk statistics endpoint.
- Live `summary.avgOdds` is for settled outcomes; Pre-Match Today pick
  AVG ODDS separately uses all Bot-selected locked prices.
- Live `summary.maxDD` represents peak-to-valley movement of the settled
  equity path, not only daily closes. The Pre-Match receiver projection
  returns null for this KPI until the writer holds an authoritative
  per-settlement drawdown measure. Do not pass off daily drawdown as exact.
- This audit verifies the **read contract and deployed frontend**. It does
  not inspect the hidden production Durable Object transaction/writer.
  Atomic commit/unique sequence requirements still require storage-side
  verification before any Pre-Match production rollout.
- Production live values observed during audit are intentionally not copied
  into Pre-Match test data, storage, graphics or counter labels.
