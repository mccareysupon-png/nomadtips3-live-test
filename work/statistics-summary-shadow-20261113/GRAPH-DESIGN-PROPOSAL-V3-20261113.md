# BALL46 — Lightweight Performance Dashboard V3 (DESIGN ONLY)

Date: 2026-11-13. Status: research/design proposal, **NOT IMPLEMENTED**. Read-only source analysis; no production activation.

## Sources reviewed

- `work/statistics-summary-shadow-20261113/reference/longterm-performance-343.js` (28,242 characters, ~28 KB of UTF-8 source text, **not** a measured transfer size or bundle budget).
- `deploy-assets/statistics-light-20261101/light.css` for dual-theme styling.
- `work/statistics-summary-shadow-20261113/ui-patch.mjs` and `bounded-summary.mjs` for ongoing summary-first architecture.
- `work/statistics-summary-shadow-20261113/WORK-PC-HANDOFF-20261113.md` and `DEPLOY-READINESS-STOP-20261113.md` for live-read correctness blockers.
- Official references: https://www.chartjs.org/docs/latest/general/performance.html, https://www.chartjs.org/docs/latest/configuration/decimation.html, https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/, https://web.dev/articles/optimize-inp/, https://www.w3.org/TR/WCAG22/.

## Assessment

Current strengths: standard key measures (ROI, cumulative P/L units, stake, win/push/loss, odds, drawdown); filters 7D/30D/90D/ALL and market; both line and daily unit OHLC; English descriptions; positive/negative colors; tooltips; dark/light themes.

**Observed from code, not measured in browser:**

1. `filteredRows()` copies, filters and sorts original rows every render. `stats(rows)` rebuilds 3 point arrays (units, ROI, win rate), even when viewing only one.
2. `render()` reassigns `shell.innerHTML`, rebuilding all KPI DOM, SVG, controls and listeners on every range change, chart mode change, wheel zoom, and drag pan.
3. `bindChart().move` recomputes scales and `pathData(currentPoints,...)` for every pointermove, then builds tooltip HTML, rather than using cached geometry and updating a small hover overlay.
4. For ROI and win rate, `chartHtml` plots every eligible signal and constructs a long SVG path; with many thousands of rows, the path may be expensive, especially on low-end mobile.
5. `pathData` maps x-coordinate by **row index**, not by elapsed time. X-axis date labels on ROI/rate could be interpreted as time-scaled despite uniform index spacing. The UI should explicitly say "Signal sequence" if retaining index spacing, or use true timestamp positions for chronological charts.
6. Daily units chart uses `Asia/Bangkok` day bucketing (`bangkokDayKey`) while other business-day accounting uses London 06:00 cutoff. Audit whether chart aggregation needs consistency with accounting period; show explicit timezone/cutoff in legend and tooltip. Do **not** silently change financial/accounting formulas.
7. A 28 KB script does NOT by itself prove high network weight. The larger historical API payload and repeated JS work are plausible primary costs. Measure on real PC/mobile before quantifying.

## Visual concept: "Deep Graphite × Teal — Quiet Depth"

Desktop order:
A. Header: "Performance" + current market + last verified update time.
B. 4 prominent KPIs: Net (units), ROI %, Win Rate %, Settled signals. Secondary disclosure: Stake U, Average Odds, Max Drawdown, W/P/L.
C. Primary compact chart card, responsive width; segmentation 7D/30D/90D/ALL on top right.
D. Chart modes: NET UNITS (default line), ROI, WIN RATE. Move "Daily OHLC candles" into an optional Advanced view (not the default).
E. Under-chart informational row: timeline/timezone, definition of U, missing-odds note, sample size and latest source age.
F. Existing result history below, loaded only when Statistics opens and possibly virtualized; not part of chart redesign without separate approval.

Mobile order: single-column heading, 2×2 KPI grid, main chart (height ~220–260 px), compact mode switch, horizontal touch-friendly ranges, optional details collapsed. No extra giant illustration or image.

Visual tokens (proposed, adjust only within chart scope):
- Dark surface: #111A1C, inner surface #162225, border rgba(215,240,235,.10), text #EAF4F1, secondary #A1B7B3.
- Light surface: #FFFFFF, chart background #F5FAF8, border #DEE9E5, text #18332F, secondary #58726B.
- Positive line: teal #24C88A, negative #DA626C, neutral/grid #72857F at <=14% opacity. Keep brand "ball46" lettering unchanged.
- Depth: one subtle inner highlight, thin 1px border, one soft shadow, a low-opacity gradient under the line; NO 3D transform, no blur/backdrop-filter, glow, large animated shadow or repeated painted gradients.
- Use color AND +/- text, labels or line markers; contrast target WCAG 2.2 AA.

## Performance design, priority order

**P0 — render only what changed**
- Keep KPI/control/chart outer elements mounted; do not replace complete `shell.innerHTML` on zoom/pan.
- Pointer hover changes only line/dot/tooltip position/text; compute plot geometry once when view changes.
- Pan/zoom use `requestAnimationFrame` to coalesce movement updates; use SVG view/subset update rather than rebuilding whole card on every event.
- Update derived data only when ledger generation, market, range or metric changes; cache day buckets and metrics by stable snapshot/filter keys. Dispose cache when leaving Statistics or on source generation change.
- Avoid additional API calls and heavy libraries initially.

**P1 — preserve chart semantics with lower point counts**
- For 7/30/90-day NET UNITS, render one data point per actual day where signals settled (existing daily aggregation); optionally show missing-day gaps explicitly if time-scaled.
- For ALL range or ROI/Win Rate, use min/max or LTTB-style decimation appropriate to chart width. Target <= ~2 points per CSS pixel for line view, plus exact endpoints and extrema. Avoid hiding meaningful losses/drawdown. Keep full-fidelity aggregates and tooltips as source of truth.
- Weighted cumulative ROI = cumulative net / cumulative priced stake × 100; never average daily ROI percentages.
- Win Rate = half-win-adjusted win credits / defined W+L denominator; never average daily Win Rate percentages.
- Preserve PUSH, HALF_WIN, HALF_LOSS, missing odds, 1U semantics and Max Drawdown formulas exactly.
- Chart must retain date/source-age labels and not claim realtime if data are cached.

**P2 — data delivery (depends on correctness release gates)**
- Move chart time-series derivation to validated compact summary/derived series only after Engine snapshot consistency is proven; keep full history lazy on explicit detail view.
- Distinguish compact chart endpoint from raw Ledger history. A complete chart does not need all raw signal fields transferred.
- No upstream calls, no Ledger schema changes without separate approval; protect snapshot/version fence.

## Choice of renderer

Recommended first: optimize existing SVG (small number of aggregated chart points, one line/area path, minimal nodes). This avoids importing Chart.js/ECharts as new dependencies. If all-range high-frequency chart benchmark still fails on lower-end Android, compare thin Canvas prototype in TEST. Do NOT assume Canvas always uses less memory; benchmark actual workload. Existing chart already SVG, not a library.

## Verification gates and suggested targets (targets, NOT actual results)

Measure baseline and candidate on same hardware, same captured Ledger, both themes, desktop and 390px low/mid Android:
- Chart JavaScript parse/transfer size (gzip/brotli), complete-page requests and payload bytes.
- `render()` wall time, pointermove long tasks, wheel/pan p95 input latency, DOM node count, JS heap, chart paint, network weight, and final chart correctness.
- Targets: interaction work <16 ms on midrange desktop / <50 ms on reference midrange mobile; <= 500–800 line samples for a 400px chart when decimating (dependent on actual CSS width); added assets <= 15 KB gzip preferred; no extra network request on hover/zoom.
- Compare all 8 market categories and cases empty, pending-only, large ALL, missing odds, future/invalid dates, DST London, and dual themes.
- Functional checks: zoom/pan, tooltip OHLC, exact extrema, zero line, app background/foreground, screen reader controls and reduced-motion.

## Release policy

This is DESIGN ONLY, not deployment authorization. Existing Engine Statistics no-op generation defect remains. Resolve the content-revision/snapshot gates in `DEPLOY-READINESS-STOP-20261113.md` before integrated QA and before requesting owner approval.

Recommended Work PC implementation order: P0 render/hover optimization -> P1 points/visual style -> P2 validated compact chart series. Separate commits and backout points. Retain current Website banners and do not touch Production.
