# NOMAD 5USD Central Hub — STEP 02 Skeleton

Status: **ISOLATED / NOT CONNECTED / NOT DEPLOYED BY THIS STEP**

This Worker is the planned shared 5DollarFootballAPI data hub for NOMAD 3.41 and 3.43.
STEP 02 creates only the shared data surface. It does not change either consumer engine.

## Isolation contract

- Do not modify NOMAD 3.41 detector, signal, settlement, statistics, UI or existing sources in STEP 02.
- Do not modify NOMAD 3.43 engine or its provider path in STEP 02.
- Do not deploy automatically from this step.
- Do not create signals or make betting decisions here.
- Do not treat Hub observation time as bookmaker quote time.

## Endpoints

- `GET /health`
  - never calls 5DollarFootballAPI
  - reports cache state, last upstream attempt/success/error and consumer connection flags
- `GET /live`
  - reads a 55-second shared cache when fresh
  - when stale/missing, performs one compound upstream request:
    - `/v1/fixtures?status=live&include=odds,events,stats&per_page=500&page=1`
  - stores the normalized snapshot in the Durable Object
  - if refresh fails but an older cache exists, returns it marked `cache.stale=true`

## Required secret

- `FIVEDOLLAR_API_KEY`

Optional read protection:

- `CENTRAL_HUB_TOKEN`
- when configured, `/live` requires header `x-central-hub-token`
- `/health` remains non-secret telemetry and does not expose the API key

## Normalized fixture contract

Each live fixture exposes:

- `fixtureId`
- league, home team, away team
- minute/status
- score
- statistics
  - attacks
  - dangerousAttack
  - shots
  - shotsOn
  - shotsOff
  - corners
  - possession
- provider events array
- Bet365 inline odds as supplied by the compound feed
  - normalized best-effort AH / Goal Line / 1X2 fields
  - raw odds object preserved for later adapters
- kickoff time
- `observedAt`
- `timestampKind = hub_observed_at`

## Timestamp rule

`observedAt` means only: **the time this Hub received and normalized the provider snapshot**.
It must never be presented to 3.41 as a bookmaker-native quote update timestamp.
STEP 03 must define referee freshness semantics before any bookmaker receives voting rights.

## Cache/rate rule

The Durable Object is the single cache owner. Multiple future consumers should read the same cached snapshot instead of each calling 5DollarFootballAPI independently.
The initial cache TTL is 55 seconds.

## Next step

STEP 03 will add the 10-bookmaker referee bus in SHADOW mode only. It must not create or select 3.41 signals until bookmaker mapping, market shape, timestamp policy and consensus tests pass.
