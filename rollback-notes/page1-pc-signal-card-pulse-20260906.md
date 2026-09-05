# Page 1 PC SIGNAL card pulse repair — 2026-09-06

Scope: presentation-only desktop repair for `nomad-live/index.html`.

Problem: desktop-only layout CSS forced `.match-row` to `#121512 !important`, so SIGNAL/LOCKED state still drove the bell icon but the green card pulse was visually suppressed on PC. Mobile was unaffected.

Change:
- Added `nomad-live/pc-signal-card-pulse.css`.
- The stylesheet restores a green SIGNAL/LOCKED card surface and pulse for desktop only (`min-width:1025px` via the index link media attribute).
- No detector, odds, runtime, signal, feed or engine logic changed.

Rollback:
1. Remove `<link rel="stylesheet" href="pc-signal-card-pulse.css?v=20260906-v1" media="(min-width:1025px)">` from `nomad-live/index.html`.
2. Delete `nomad-live/pc-signal-card-pulse.css`.

Creation commit for CSS file: `6f55fb8041fccab4060a382f4ca8b7790463e4b4`.
