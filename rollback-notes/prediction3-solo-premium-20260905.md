# Prediction3 Solo Premium Card — 2026-09-05

Scope: Prediction3 presentation + its isolated manual ledger only.

Changed files:
- `prediction3/index.html`
- `prediction3/prediction3.css`
- `prediction3/prediction3.js`
- `prediction3/data/ledger.json`

Isolation contract:
- No Prediction2 / KING V3 files changed.
- No NOMAD Live engine files changed.
- No scheduler or settlement workflow changed.
- No D1 or live-feed logic changed.

Pre-change blob SHAs:
- `prediction3/index.html` — `8cb8ecf4cd4a0795b9c3663acd2619bbf83962f9`
- `prediction3/prediction3.css` — `dab8125865be6fe1661f2bc5b9764acc46a1138e`
- `prediction3/prediction3.js` — `f3f10929b7ec093a960a0a1c62d038add6e04b32`
- `prediction3/data/ledger.json` — `8eb42a759a4b87c70b7bc61e14eacd71e9854908`

Current feature:
- Solo-mode featured card for SC Paderborn 07 vs SC Freiburg.
- Vintage inline analysis icon set.
- Generated vintage shirt icons for both teams.
- Rich manual sections: Why This Pick, Match Support, Tactical View, Risk Outlook, No-Bet triggers, Final Call, Sources Reviewed.
- Manual/provisional status retained pending confirmed XI.

Rollback procedure:
Restore each changed file to the corresponding pre-change blob above. This returns Prediction3 to the empty manual structure without touching any other NOMADTIPS3 page or engine.
