# BALL46 mobile Event Flow bars — isolated preview

Preview: http://127.0.0.1:8817/
Branch: codex/ball46-mobile-event-flow-bars-20261102
Source commit: 7174573510bfc469370e466588401629a32010ba
Verification: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41367014128

This is a design prototype using clearly labelled synthetic data. Production was not changed. No provider or external API request is made by the preview.

## Design

- Two narrow bars per recorded minute: green HOME and yellow AWAY, on the same absolute 1–100% pressure scale. Values are not rescaled to probabilities or forced to sum to 100.
- The chart is 240px high: 48px above, 144px of plotting area, 48px below. The time axis sits outside that reserved chart area.
- HOME signal cards are above; AWAY cards below. OVER is placed above and UNDER below with neutral colours. Totals signals link to their time, not a fabricated team-pressure percentage.
- Signal X coordinates retain the original minute, including seconds and added time. Team-pressure anchors are interpolated only within available adjacent history; missing history stays blank and time-only markers are used when pressure is unavailable.
- Cards are positioned within their lane. If there are too many, the closest groups merge into counted cards. Every original signal remains in the details list; missing/out-of-range minutes remain accessible outside the plot.
- Callout buttons have 44px hit areas. Signals expose market, pick, line, odds, bookmaker and entry score on demand. Match event icons are retained in a separate expandable rail to reduce chart clutter.
- Plot data/DOM are not rebuilt when opening a Signal detail. Chart values can be inspected by touch or keyboard.

## Validation

9 layout/data tests and 56 browser cases passed: 320, 360, 390 and 430px; dark/light; normal signals, 18 dense signals, missing history, no signals, unknown/out-of-range times, added time and no history. Checked card collisions/bounds, 20% lanes, percentage scale, complete signal access, unchanged plotted data during selection, event access, page overflow and zero external requests.

## Scope before any future rollout

This is not a production data integration. An approved integration must consume existing shared fixture/history/signal snapshots without adding fetches or changing polling, scope the bar renderer to the current mobile breakpoint, retain the desktop renderer, verify actual Signal schema and run live-data regression checks before any separately approved deployment. No Engine, Signal calculation, Member, Ledger, Settlement or billing file was edited.
