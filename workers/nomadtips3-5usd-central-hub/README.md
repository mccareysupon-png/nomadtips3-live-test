# NOMAD 5USD Central Hub — STEP 03 Shadow Referee Bus

Status: **ISOLATED / SHADOW ONLY / NOT CONNECTED / NOT DEPLOYED**

This Worker is the planned shared 5DollarFootballAPI data hub for NOMAD 3.41 and 3.43.
STEP 03 adds the 10-bookmaker referee bus while preserving strict isolation from both engines.

## Isolation contract

- Do not modify NOMAD 3.41 detector, signal, settlement, statistics, UI or existing production sources in STEP 03.
- Do not modify NOMAD 3.43 engine or its provider path in STEP 03.
- Do not deploy automatically.
- Do not create signals or make betting decisions here.
- Every referee is `shadowOnly=true` and `voteEligible=false`.
- Do not treat Hub observation/change-detection time as bookmaker-native quote time.

## Endpoints

### `GET /health`

- never calls 5DollarFootballAPI
- reports live-cache telemetry and referee-bus telemetry
- reports both NOMAD consumers as disconnected

### `GET /live`

- reads a 55-second shared cache when fresh
- refreshes from `/v1/fixtures?status=live&include=odds,events,stats`
- compound include responses are requested with `per_page=50`
- follows provider pagination up to 10 pages and deduplicates fixtures by provider fixture id
- stores one normalized snapshot in the Durable Object
- if refresh fails but an older cache exists, returns it marked `cache.stale=true`

### `GET /referees?fixtureId=<5USD fixture id>`

- requires a numeric provider fixture id
- reads a 55-second per-fixture referee cache when fresh
- on refresh performs one multi-bookmaker request for the Asian Handicap market:
  - `/v1/fixtures/{id}/odds?market=asian&bookmakers=<10 slugs>`
- returns exactly ten mapped referee sockets in SHADOW mode
- no referee has voting rights in STEP 03

## 10 referee socket map

| 3.41 socket | Position | 5USD bookmaker | Slug | STEP 03 vote |
|---|---:|---|---|---|
| source5 | 5 | 1xBet | `1xbet` | OFF |
| source6 | 6 | Bet365 | `bet365` | OFF |
| source9 | 9 | Macauslot | `macauslot` | OFF |
| source10 | 10 | Crown | `crown` | OFF |
| source14 | 14 | Easybets | `easybets` | OFF |
| source15 | 15 | Vcbet | `vcbet` | OFF |
| source16 | 16 | Interwetten | `interwetten` | OFF |
| source18 | 18 | 12Bet | `12bet` | OFF |
| source21 | 21 | 18Bet | `18bet` | OFF |
| source25 | 25 | Pinnacle | `pinnacle` | OFF |

The map deliberately reuses existing 3.41 socket positions. STEP 03 does not edit the 3.41 price-source registry.

## Referee output contract

Each referee exposes:

- `sourceId`
- `position`
- bookmaker display name and provider slug
- provider = `5DollarFootballAPI`
- market = `FULL MATCH LIVE AH`
- status = `AH READY`, `AH UNAVAILABLE`, `AH INVALID`, or `BOOKMAKER UNAVAILABLE`
- HOME line and derived AWAY line
- HOME / AWAY decimal prices
- `bookmakerVerified`
- `observedAt`
- `timestampKind = hub_observed_at`
- `sourceUpdatedAt = null`
- `lastChangedAt`
- `lastChangedAtKind = hub_detected_change_at`
- `shadowOnly = true`
- `voteEligible = false`

## Timestamp/freshness rule

`observedAt` is the time the Hub received the bookmaker snapshot.
`lastChangedAt` is the first Hub observation of the current line/price fingerprint.
Neither value is a provider-native bookmaker quote timestamp.
They must not be passed to 3.41 as bookmaker-native `sourceUpdatedAt`.
STEP 03 therefore keeps all ten referees outside real consensus voting.

## Rate-safety design

- Live compound feed cache: 55 seconds.
- Compound pages: 50 fixtures per request because provider docs cap `include=` responses at 50.
- Referee cache: 55 seconds per fixture.
- Ten bookmakers are requested together in one fixture-odds request, not ten separate calls.
- Concurrent duplicate requests for the same fixture share one in-flight promise inside the Durable Object.
- Provider `X-RateLimit-*` telemetry is captured for later deployment/rate-governor work.

The current 5DollarFootballAPI documentation states that Ultra uses a 40 requests/minute account-wide window and that non-Bet365 bookmakers require Ultra (or an eligible equivalent plan). This STEP does not assume spare quota exists while 3.43 still calls the provider directly; deployment remains blocked until the migration rate budget is reviewed.

## Secrets

Required when eventually deployed:

- `FIVEDOLLAR_API_KEY`

Optional read protection:

- `CENTRAL_HUB_TOKEN`
- when configured, `/live` and `/referees` require header `x-central-hub-token`
- `/health` remains non-secret telemetry

## Gate to STEP 04

Before any consumer is moved to this Hub:

1. syntax + contract CI must pass;
2. diff must show no production 3.41/3.43 files changed;
3. a later isolated deployment must verify real provider payload shape for all ten bookmaker slugs;
4. missing bookmaker / missing in-play AH must fail closed;
5. rate-budget telemetry must be reviewed before 3.43 is switched from direct provider calls.
