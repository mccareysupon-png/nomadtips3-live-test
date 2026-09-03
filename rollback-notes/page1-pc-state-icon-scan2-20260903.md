# Page 1 PC status icon rollback — 2026-09-03

Scope: `nomad-live/index.html` collapsed cards on desktop/PC only (>=1025px).

Intent:
- keep current vertical team rows and per-team score mirror
- restore the status zone to the far-left position before team information
- replace the collapsed-card vintage status meter with the existing toolbar sprite icon that matches the real row state
- WATCHING -> Watching icon
- NEAR SIGNAL -> Near icon
- SIGNAL or LOCKED -> Signal icon
- use a slow visual pulse only; no detector/feed/odds/signal logic changes
- do not alter tablet/mobile or other pages

Pre-change blobs:
- `nomad-live/index.html`: `78b7cd3c0be53992758bb70000cefd13ea4f87c7`
- `nomad-live/collapsed-card-wide.css`: `6a9018f18f85a6aa1d0aaeb65cb640dbef789ff5`
- existing sprite source remains unchanged: `nomad-live/assets/icons/vintage-toolbar-independent.webp`
- existing sprite mapping CSS remains unchanged: `nomad-live/toolbar-vintage-independent-icons.css` blob `8a2ef437878366cbd6ce0d936465f9f785b8cec0`

Rollback:
1. restore `nomad-live/index.html` blob `78b7cd3c0be53992758bb70000cefd13ea4f87c7`
2. restore `nomad-live/collapsed-card-wide.css` blob `6a9018f18f85a6aa1d0aaeb65cb640dbef789ff5`
3. delete `nomad-live/card-status-icons.css`

No engine/data rollback is required.
