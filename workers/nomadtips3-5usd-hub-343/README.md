# NOMAD 3.43 — 5USD HUB

Independent central live-data hub for NOMAD engines.

## Responsibility

`5DollarFootballAPI -> one central snapshot -> downstream engines`

The hub intentionally does **not** contain 3.42 or 3.43 market rules. It only fetches, normalizes, stores, and serves provider data.

## Provider pull

Confirmed live batch route:

`GET /v1/fixtures?status=live&include=events,stats&per_page=500&page=1`

Normal cadence: every 120 seconds. Pagination is followed only when `has_more` is true.

## Public routes

- `GET /snapshot` — latest central snapshot
- `GET /health` — hub freshness / provider status
- `GET /status` — alias of `/health`

There is no public force-refresh route. A Durable Object named `FiveUsdHub` serializes refresh work and persists the last-good snapshot. The scheduled worker refreshes every two minutes. If the schedule is delayed, `/snapshot` may refresh only when the stored snapshot is due.

## Data rules

- Provider fixture ID is kept as the canonical fixture key.
- `statistics = null` stays unavailable; it is never converted to zero.
- Shots on Target / Shots off Target / Corners are kept as provider cumulative counts here. Rolling deltas belong to downstream engines.
- Attacks / Dangerous Attacks remain provider cumulative counts here. Percentage conversion belongs to downstream engines.
- Ball Possession remains the provider percentage.
- Provider odds fields are passed through when they exist in the fixture payload. Exact Bet365 market wiring remains a downstream step after its response schema is verified.
- On provider failure the last-good snapshot remains available and becomes `stale` by age instead of being replaced with empty/fake data.
