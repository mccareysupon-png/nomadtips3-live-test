# Statistics ODDS SOURCE rollback — 2026-09-03

Scope: Page 2 / `nomad-live/statistics.html` only, plus its bookmaker icon decorator.

Pre-change blobs:
- `nomad-live/statistics.html` — `dea75cddb19e74064fec7f183d4ba4084f7aab22`
- `nomad-live/statistics-bookmaker-icons.js` — `0e9ff12fdb1e9d4d6ca9674e50e881918d6bc61e`

Planned change:
1. Public table label `BOOKMAKER` -> `ODDS SOURCE`.
2. Keep the underlying record field `r.bookmaker` unchanged.
3. Update the icon-column detector so existing bookmaker icons continue to work with the new public label.
4. No changes to live engine, odds feed, statistics API, row order, table column count, settlement logic, or bookmaker asset files.

Rollback: restore the two pre-change blobs above.
