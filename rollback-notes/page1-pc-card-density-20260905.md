# Page 1 PC card density lock — 2026-09-05

Scope: desktop presentation only (`min-width:1025px`). No feed, detector, odds, score data, signal, settlement, engine, D1, mobile or tablet logic changed.

## Before change
- `nomad-live/match-list-overflow.css` blob: `b440d71ebb7901451d7571fe1ffd151dfdf616c8`
- `nomad-live/pc-card-density-lock.css`: did not exist

## Change
- Added `nomad-live/pc-card-density-lock.css` as the final desktop owner for match-card horizontal density and hover/open outline.
- Added one top-level `@import` in `nomad-live/match-list-overflow.css` so the new override loads after the existing collapsed/expanded card CSS.

## Rollback
1. Restore `nomad-live/match-list-overflow.css` to blob `b440d71ebb7901451d7571fe1ffd151dfdf616c8`.
2. Delete `nomad-live/pc-card-density-lock.css`.

No engine/data rollback is required.
