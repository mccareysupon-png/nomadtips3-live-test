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
