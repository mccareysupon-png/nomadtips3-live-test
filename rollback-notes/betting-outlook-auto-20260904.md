# Betting Outlook rollout — 2026-09-04

## Scope
Editorial/news layer only. No live-engine, feed, settlement, odds, D1 or signal logic changes.

## Changes made
- Added shared footer link `Betting Outlook` after `Mobile App` in `public-info-footer.js`.
- Added `news-bg.svg` as the editorial background artwork.
- Added visual-only hero background override in `news.css`.
- Added `/news.html`, `/news.css`, `/news-bg.svg` to the production web public-info proxy asset set in `nomad-live-web-production/src/index.js`.
- Added `NEWS-OUTLOOK-POLICY.md` for the scheduled daily editorial process.

## Pre-change rollback references
- `public-info-footer.js` previous blob SHA: `bc71761a4c241560b5dc6536fb0a83ac5b0043e8`
- `news.css` previous blob SHA: `cbe38b4ba4097a3c77215a203fc1ae9c73138e65`
- `nomad-live-web-production/src/index.js` previous blob SHA: `8f358827ae910a5b001074e7a40c8dd5007bff16`
- `news-bg.svg` did not exist before this rollout.
- `NEWS-OUTLOOK-POLICY.md` did not exist before this rollout.

## Rollback method
1. Restore the three previous blobs above.
2. Delete `news-bg.svg` if the editorial background is being removed.
3. Delete `NEWS-OUTLOOK-POLICY.md` only if the daily Outlook workflow is being retired.
4. Disable the scheduled ChatGPT automation separately if the daily automatic editorial run is being retired.

## Expected public route
`https://www.nomadtips3.com/news.html`

## Footer label
`Betting Outlook`
