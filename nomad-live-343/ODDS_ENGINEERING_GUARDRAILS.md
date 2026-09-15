# NOMAD 3.43 Odds Engineering Guardrails

This file is a permanent incident/engineering guard for the 3.43 V2 odds path.

## John bulk-only contract

Provider path is fixed:

`5USD bulk fixtures include=odds,events,stats -> HUB snapshot -> Engine board -> UI`

Rules:

- No browser call to `api.5dollarfootballapi.com`.
- No browser/Engine per-fixture provider request.
- No `/fixture-odds` or live `/api/full-market/*` data path from V2 UI.
- Clicking/expanding a match must add **0 provider requests**.
- Clicking a bookmaker tab must add **0 provider requests**.
- UI reads the fixture snapshot already present on `/api/engine/board`.
- If the bulk snapshot does not contain a bookmaker, market, stage or side price, show `—`. Missing bulk data is never a reason to fan out.
- A provider endpoint shaped like `/fixtures/{fixtureId}/odds` is forbidden in the public 3.43 request path, even if it can return richer prices.

### 2026-09-15 fan-out incident — permanent ban

A per-fixture Full Market Worker was briefly introduced that used one provider request when a user expanded a match. That design was removed because public traffic would turn user clicks into provider load and violated John's explicit instruction to stop fanning out.

Permanent consequences:

- `workers/nomadtips3-343-full-market/` must not exist.
- Preview must not have a `FULL_MARKET` service binding.
- `/api/full-market/*` must remain disabled (`410`) rather than proxying a provider request.
- `full-market-bookmaker-343.js` must be network-free (`fetch()` forbidden) and expose `networkMode: NONE`, `source: BULK_SNAPSHOT_ONLY`.
- CI must fail immediately if any of the above is restored.

## Odds data completeness

Do not assume a single odds schema.

The bulk list can carry market lines as scalars:

- `asian_handicap.opening = -0.25`
- `goal_line.closing = 2.75`
- `corner_line.inplay = 10.5`

Richer bulk payloads, when present, can carry stage objects:

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

The UI keeps the 19 canonical bookmaker slots in display order even when the bulk snapshot contains only some of them. Missing data stays `—`.

Bet365 is always first. Additional bookmaker data is displayed only when it actually exists in the bulk fixture snapshot.

## Single DOM owner

There must be exactly one renderer for expanded Full Market content:

- `expanded-match-343.js` owns shell + Event Flow + fixture handoff only.
- `full-market-bookmaker-343.js` is the only code allowed to render Full Market/Bookmaker content.

Never reintroduce a second Odds renderer in `expanded-match-343.js`. Dual renderers caused visible flicker and data replacement during board refreshes.

## Expanded-card layout guard

Desktop/laptop Match Board owns its vertical scrollbar. Expanded cards must remain in normal document flow inside the board and must increase the board's scrollable height.

- `.main-board` must not clip Expanded Cards.
- `.board-sections` is the vertical scroll owner.
- Because `.board-sections` is a CSS Grid, use `align-content: start` and `grid-auto-rows: max-content`; otherwise status sections can stretch to the viewport and clip their children instead of increasing `scrollHeight`.
- Mobile keeps natural page scrolling; do not introduce nested vertical scrolling on touch layouts.
- After opening a match, CI must prove `scrollHeight > clientHeight`, the scroll position can move, and the same Expanded Card DOM node survives the 30-second board refresh.

## Regression checks

CI must check:

- Full Market renderer contains no network call.
- Click/expand and bookmaker-tab interactions produce 0 `/api/full-market/` resource requests.
- Per-fixture Full Market Worker and Preview `FULL_MARKET` binding are absent.
- `/api/full-market/*` is hard-disabled.
- Expanded shell contains no second Odds renderer.
- Parser self-test covers scalar lines and rich stage objects without network access.
- Runtime remains `BULK_SNAPSHOT_ONLY` with `externalOddsRequests = 0`.
- Runtime HUB snapshot uses `include=odds,events,stats`.
- Expanded-card scrollbar/layout and 30-second DOM stability are browser-tested.
