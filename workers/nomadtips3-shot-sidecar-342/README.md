# NOMAD 3.42 Shot Sidecar

Isolated display-only SOT/SOFF sidecar for NOMAD LIVE 3.42.

## Hard boundaries

- Does not write to `nomad-live-score-feed-v3`.
- Does not modify `event.snapshots`.
- Does not call or modify K Rules, `/candidate`, Signal Engine, Ledger, Statistics, Settlement, or market settings.
- `detectorConnected` is intentionally `false`.
- `futureDetectorPort` is only a prepared contract marker.

## Sources

- NOMAD match identity: `nomadtips3-live-score-feed-v3 /feed`.
- Shot statistics: `GET /v1/fixtures?status=live&include=stats&per_page=500` from 5DollarFootballAPI.
- One provider request returns the full live board (up to 500 fixtures) with embedded statistics. The sidecar caches this board for 15 minutes, which stays far below the Pro 10 requests/minute limit.

## Mapping

Precision before coverage. Home maps only to Home, Away only to Away. Low-confidence or ambiguous mappings are rejected. Successful mappings are locked by NOMAD match id for the lifetime of the active match in the Worker isolate.

## Snapshot contract

The response exposes current cumulative `shotOnTarget` / `shotOffTarget`, an actual observed match minute, a 15-minute bucket marker, and a best-effort `rolling15` delta when two consecutive sidecar snapshots exist. Provider corrections never emit negative rolling shot deltas.

## Secret

Required Worker secret: `FIVEDOLLAR_API_KEY`.
