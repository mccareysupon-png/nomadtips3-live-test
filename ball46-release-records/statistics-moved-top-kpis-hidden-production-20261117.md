# BALL46 Statistics — redundant moved top KPI strip visual removal

**Production deployment: SUCCESS, live QA verified, 17 November 2026 (Asia/Bangkok).**

- Cloudflare Worker: `ball46-production`, traffic 100%.
- Active deployed version: `f5d9cf21-4b41-46da-bdd8-a841fa733d82`.
- Exact rollback point: `183f194b-0354-4366-8bca-9b17ca6458b0`.
- GitHub Actions: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43984533516
- Source patch on branch: `deploy-assets/ball46-statistics-fast-v1-20261116/remove-moved-kpi-strip.mjs`.

## User-reported defect

Old 8-tile row (SETTLED, UNSETTLED, WIN, LOSS, PUSH, WIN RATE, AVG ODDS, SETTLED DAYS) appeared before and/or after loading, despite the user moving these data into the financial card on the right.

## Resolution

The original 7 static `.sp-kpis` cards and the dynamic `SETTLED DAYS` card are now nonvisual from the initial HTML. The historic desktop adapter can also reconstruct a separate 14-value `.b46v23-strip`; it is suppressed before rendering via an early head observer with inline `display:none!important`, plus scoped fallback CSS.

**Important:** The original source elements remain in the DOM **hidden** because the currently approved financial summary JS reads them to build the new 8-tile finance card. Attempting to delete them outright was caught by inactive QA as destructive. This release eliminates the visible duplicate, not the internal data source. No extra ledger calculations or API calls introduced.

## Validation

Owner-approved inactive and live browser checks passed on PC Total, PC 1X2, PC AH, mobile Total; tests check initial DOM readiness, after fast snapshot, native full Ledger transition, and right finance card preservation (8 summary KPIs / 3 outcome segments). 0 JavaScript errors in tested paths; no duplicate strip pixels. Only the `statistics-menu-entry-20261114.mjs` Worker module changed. Other 51 modules, Engine, Ledger, formulas and production snapshot service left unchanged.

In case of regression restore 100% to `183f194b-0354-4366-8bca-9b17ca6458b0`; do not roll back the Engine or mutate archived rows.
