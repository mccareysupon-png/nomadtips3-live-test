# Live Engine V2 -> D1 Ingest Contract

## Purpose

The VPS Collector is the only upstream football API caller. Cloudflare receives normalized state only.

## Endpoint

`POST /v2/ingest`

## Authentication

Use an HTTPS bearer secret stored only in runtime secret stores.

Collector request header:

`Authorization: Bearer <V2_INGEST_SECRET>`

Cloudflare Worker secret:

`V2_INGEST_SECRET`

Never embed this secret in frontend JavaScript or commit it to GitHub.

## Request body

```json
{
  "collector_id": "vps-primary",
  "state_hash": "sha256-hex",
  "payload": {
    "schema": "nomadtips3.live.v2.fixture-snapshot",
    "generated_at": "ISO-8601",
    "live_count": 0,
    "preliminary_candidate_count": 0,
    "statistics_fixture_count": 0,
    "live_odds_fixture_count": 0,
    "request_count_process": 0,
    "rate_limit": {},
    "condition": {},
    "fixtures": [],
    "preliminary_candidates": [],
    "statistics": {},
    "live_odds": {}
  }
}
```

## Publish policy

The Collector should publish when:

- normalized state changes, or
- a heartbeat interval has elapsed.

Recommended heartbeat: 60 seconds.

A browser refresh must never invoke this endpoint and must never cause a new API-Football request.

## Public read contract

Suggested endpoint:

`GET /v2/state`

Returns the latest stored state only.

## Owner config contract

Suggested endpoints:

- `GET /v2/owner/config`
- `PUT /v2/owner/config`

Owner writes must be authenticated server-side and version checked to prevent overwriting a newer config accidentally.

## Cutover rule

Do not enable the V2 publisher and the old Car 3 upstream scanner at the same time during final live validation. Exactly one upstream live collector must own API-Football scanning after cutover.
