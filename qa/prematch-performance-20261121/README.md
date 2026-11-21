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
- AVG ODDS = mean of original locked selection odds, counting selections
  once and never using changing live price.
- Daily close: 06:00 Europe/London, respecting daylight saving transitions.
- Max drawdown: maximum peak-to-valley decline of **daily closing equity**;
  it is not intraday drawdown.
- Unsettled counts pending items and is not included in ROI denominator.
- W/D/L: DRAW represents settlement PUSH/void, **not** a 1X2 bet that
  predicted a drawn match.

## Persistent incremental rollout contract (not yet wired)
- `performance-core.mjs` is a pure incremental projection module.
- The settlement owner must send a monotonically sequenced, already
  validated, immutable `SELECTED` / `SETTLED` event exactly once after
  ledger commit. Deduplicate on (market, signal_id, settlement transition).
- Persist the updated `schema:1` snapshot and daily buckets in the same
  durable transaction or via replayable outbox. Reject sequence gaps. Retry
  only from outbox, never refetch provider matches for a chart.
- Late settlements update the affected London daily bucket and subsequent
  daily cumulative closings only at write time.
- On reads: return `performanceSnapshot` from persisted rollups; do not
  scan every historic match or recalculate all results.
- A 7D/30D/90D/ALL request filters **daily snapshots**, not individual matches.
  Retaining 10 years means roughly 3,653 daily points, not millions of raw
  rows moved to the browser. Downsample for very dense chart view if needed.
- Keep per-market snapshots separate (1X2, future BTTS). Never fabricate a
  previous daily series. Preserve original ledger for audit.

## Current staged coverage and outstanding prerequisite
- On the isolated test Worker, the existing source exposes only TEST_ONLY
  ledger rows plus a Today business-day aggregate; no multi-day persisted
  `performanceSnapshot` is confirmed. The UI displays at most that one
  recorded day and explicitly indicates that historical daily snapshots
  are not yet connected. It does not synthesize a trend.
- Production settlement writer and its Durable Object storage are **not**
  modified by this branch. It is NOT accurate to claim long-term durable
  data collection is live until the writer supplies the snapshot.
- QA verifies projection formulas in Node and multi-day chart rendering
  using **browser-only synthetic response interception**, without writing
  artificial matches, results, or snapshots into a Worker, DB or Production.


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
