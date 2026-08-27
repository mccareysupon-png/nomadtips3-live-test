# NOMAD LIVE 3.42 — TotalCorner inlet

This Worker is isolated from NOMAD Live 3.41. It reads live match/event data from TotalCorner and exposes a normalized `/feed` contract for the 3.42 browser engine.

## Flow

`TotalCorner -> 3.42 inlet -> rolling event snapshots -> NOMAD event gate -> M88 referee -> Signal`

TotalCorner is the match/event carrier only. M88 remains a separate, fail-closed price referee.

## Endpoints

- `GET /health` — source/worker health
- `GET /feed` — normalized live matches with rolling snapshots
- `GET /contract` — feed shape reference

## Safety

- Dedicated Worker name: `nomadtips3-live-engine-342`
- No imports from the 3.41 engine
- Source requests use `no-store` plus a cycle token
- Detail requests are concurrency-limited
- Source snapshots are marked stale after 90 seconds without change
- Browser live mode does not fall back to hard-coded test fixtures

This branch/PR does not deploy the Worker. Validate the feed first, then deploy the isolated 3.42 Worker separately.
