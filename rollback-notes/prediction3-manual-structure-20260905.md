# Prediction3 manual structure rollback — 2026-09-05

Scope: isolated manual Prediction3 page only.

Created paths:
- `prediction3/index.html`
- `prediction3/prediction3.css`
- `prediction3/prediction3.js`
- `prediction3/data/ledger.json`

Production routing change:
- `nomad-live-web-production/src/index.js` adds `/prediction3` -> GitHub Pages bridge.
- Previous Worker blob before this change: `34877f17b5388afeaf3270a5c4d7edab26111b75`.

Rollback:
1. Restore `nomad-live-web-production/src/index.js` to blob `34877f17b5388afeaf3270a5c4d7edab26111b75`.
2. Delete the four `prediction3/` files above if the page must be fully removed.

Isolation contract:
- No The King / Goaloo selection engine is connected.
- No automatic scheduler is connected.
- No automatic settlement wheel is connected.
- No Prediction2/KING Statistics V3 data is imported.
- Prediction3 uses its own `prediction3/data/ledger.json` only.
