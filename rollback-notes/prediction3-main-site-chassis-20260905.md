# Prediction3 main-site chassis rollback — 2026-09-05

## Scope
Presentation-only alignment of Prediction3 with the NOMADTIPS3 public chassis.

Changed:
- `prediction3/index.html`
- `public-info-footer.js`
- added `prediction3/main-site-chassis.css`

Intentionally unchanged:
- `prediction3/prediction3.css` Golden Premium analysis-card design
- `prediction3/prediction3.js` analysis renderer
- `prediction3/data/ledger.json` pick / odds / analysis data
- Prediction2 / KING V3
- live engines, feeds, signals, settlement, D1, schedulers

## Baseline before this change
- `prediction3/index.html` blob: `f2a7d1eb4669ea09d1aa2ae51dca7a1595180467`
- `public-info-footer.js` blob: `8aff60e3f54eb1c31051bd003657a1cf35c1a203`
- `prediction3/main-site-chassis.css`: did not exist

## Rollback
1. Restore `prediction3/index.html` to blob `f2a7d1eb4669ea09d1aa2ae51dca7a1595180467`.
2. Restore `public-info-footer.js` to blob `8aff60e3f54eb1c31051bd003657a1cf35c1a203`.
3. Delete `prediction3/main-site-chassis.css`.

This returns Prediction3 to the prior Golden Solo Premium page with the standalone footer rail and prior Soccer Predictions header bridge.
