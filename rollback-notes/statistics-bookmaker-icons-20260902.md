# Statistics bookmaker icons rollback — 2026-09-02

Scope: Page 2 / `nomad-live/statistics.html` only.

Baseline before bookmaker-icon work:
`fb38bee0fb876cee686c7b6fdd28844ca5e239d4`

Added files:
- `nomad-live/statistics-bookmaker-icons.css`
- `nomad-live/statistics-bookmaker-icons.js`

Planned activation in `nomad-live/statistics.html`:
- load `statistics-bookmaker-icons.css`
- load `statistics-bookmaker-icons.js`

Behavior:
- keeps bookmaker text in the table DOM
- maps only known names to logo presentation
- unknown bookmaker names fall back to normal text
- default icons are bright and clear
- hover adds a brighter glow
- bookmaker rows may become slightly taller for readability

Fast rollback:
1. Remove the bookmaker-icon CSS and JS references from `nomad-live/statistics.html`.
2. Optional cleanup: delete the two added bookmaker-icon files.
3. No statistics, odds, settlement, pagination, feed, engine, or Page 3 / `nomad-live-342` files are involved.

Full rollback baseline:
`fb38bee0fb876cee686c7b6fdd28844ca5e239d4`
