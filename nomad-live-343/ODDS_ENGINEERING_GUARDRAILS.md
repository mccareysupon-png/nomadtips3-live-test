# NOMAD 3.43 Odds Engineering Guardrails

This file is a permanent incident/engineering guard for the 3.43 V2 odds path.

## John bulk-only contract

Provider path is fixed:

`5USD bulk fixtures include=odds,events,stats -> HUB snapshot -> Engine board -> UI`

Rules:

- No browser call to `api.5dollarfootballapi.com`.
- No browser/Engine per-fixture provider request.
- No `/fixture-odds` or `/api/full-market/*` from V2 UI.
- Clicking/expanding a match must add **0 provider requests**.
- UI reads the fixture snapshot already present on `/api/engine/board`.

## Odds data completeness

Do not assume a single odds schema.

The bulk list can carry Bet365 market lines as scalars:

- `asian_handicap.opening = -0.25`
- `goal_line.closing = 2.75`
- `corner_line.inplay = 10.5`

Richer odds payloads can carry stage objects:

- AH: `{ line, home, away }`
- O/U: `{ line, over, under }`
- 1X2: `{ home, draw, away }`
- BTTS: `{ yes, no }`

Parser requirements:

- Preserve `OPEN`, `CLOSE/current`, and `LIVE/inplay`.
- Accept scalar, object, array and nested market containers.
- Unknown fields/markets must be preserved/rendered where possible, not silently dropped.
- Missing values render as `—`; never fabricate prices.
- When merging a scalar line with a richer price object, **the richer object wins**.

## Bookmakers

The UI matrix keeps the 19 documented bookmaker columns in display order even when a bookmaker has no data for a market. Missing data stays `—`.

Bet365 is always first and may be assembled from all snapshot locations that actually exist (`providerOdds.bookmakers`, `providerOdds.bet365`, `providerOdds.odds`, `providerOdds.markets`, and Engine `fullOdds`).

## Single DOM owner

There must be exactly one renderer for the expanded Odds card:

- `expanded-match-343.js` owns shell + Event Flow + fixture handoff only.
- `expanded-odds-complete-343.js` is the only code allowed to render Odds table content.

Never reintroduce a second `renderOdds()` in `expanded-match-343.js`. Dual renderers caused visible flicker and data replacement during board refreshes.

## Regression checks

CI must check:

- Complete Odds renderer contains no network call.
- Expanded shell contains no legacy Odds renderer.
- Direct 5USD/full-market/per-fixture callers are forbidden.
- Parser self-test covers scalar lines and full-price stage objects.
- Runtime remains `BULK_SNAPSHOT_ONLY` with `externalOddsRequests = 0`.
- CI logs current Board odds coverage so missing-source vs missing-parser problems can be separated quickly.
