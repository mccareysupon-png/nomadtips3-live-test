# BALL46 Viewer Read-Only Architecture Lock V1

Public viewers only read Ball46 snapshots/caches. Clicking a card, expanding a match, changing a Signal filter, refreshing a page, or increasing viewer count must never trigger a 5DollarFootballAPI provider request.

- Bulk = HUB scheduler only.
- Engine scan = cron/internal scan only; read endpoints never start scans.
- Referee odds = Engine candidate/referee lane only.
- Settlement recovery = Engine recovery lane only.
- Public Full Market = `/board-cache`, read-only, `externalRequestsAdded=0`.
- Public `/api/full-market/fixture-odds` = HTTP 410.
- Public `/api/engine/scan` and `/api/engine/fixture-odds` = HTTP 403.
- Rich odds stay in `fullOdds/richOdds`, never default-card `providerOdds`.
- `market-core.js`, `ceo-condition.js`, Settings, RunState, Market Registry and referee max 4/scan were verified unchanged.

Audited production: Ball46 `ac0ca816-54ac-402c-bc50-7d6c88a1d2d1`; Engine `83cbf5c6-fb5e-46eb-908f-0035e3d9dc3d`; final audit run `35500888478`.

Marker: `BALL46_VIEWER_READONLY_LOCK_V1`
