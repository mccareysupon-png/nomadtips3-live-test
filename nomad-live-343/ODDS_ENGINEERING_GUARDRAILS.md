# NOMAD 3.43 Odds Engineering Guardrails

This file is a permanent incident/engineering guard for the 3.43 V2 odds path.

## John central-data contract

Base provider path is fixed:

`5USD bulk fixtures include=odds,events,stats -> HUB snapshot -> Engine board -> UI`

The bulk response is the source for fixture state, live score, events, statistics, 1X2 and market lines. John also confirmed that the two-sided payout prices for handicap-style markets require `GET /v1/fixtures/{id}/odds`. Those richer prices are therefore allowed only as a **central scheduled enrichment inside the HUB**, never as a user-driven request.

Rules:

- No browser call to `api.5dollarfootballapi.com`.
- No browser/Engine per-fixture provider request.
- No live `/api/full-market/*` provider data path from V2 UI.
- Clicking/expanding a match must add **0 provider requests**.
- Clicking a bookmaker tab must add **0 provider requests**.
- UI reads only the central fixture snapshot already present on `/api/engine/board`.
- Public snapshot reads must not trigger a provider refresh; provider refresh/enrichment is cron-controlled centrally.
- Base bulk refresh remains `include=odds,events,stats`.
- Rich odds may use `/fixtures/{fixtureId}/odds?bookmakers=...` only from the central HUB scheduled refresh.
- Rich enrichment must be rate-budgeted and must stop on provider 429 or when the provider's `X-RateLimit-Remaining` reaches the configured reserve.
- Missing data is rendered as `—`; never fabricate prices.

### Central rich-odds budget — 2026-09-15

Ultra is 40 requests/minute and the account counter is shared by all keys/services. NOMAD therefore does not spend the whole allowance.

Current guard:

- Base bulk refresh: maximum 5 provider requests per 120-second cycle under the current paged TODAY + LIVE implementation.
- Central rich odds: maximum 24 per scheduled refresh.
- Combined hard budget per refresh: maximum 29.
- Stop rich enrichment when provider `X-RateLimit-Remaining <= 8`.
- Stop immediately on 429 and preserve the previous snapshot values.
- Only live fixtures already represented in the central odds snapshot are eligible.
- A durable round-robin cursor distributes enrichment across live fixtures when there are more eligible fixtures than the current cycle budget.
- Rich response requests all 19 canonical bookmakers in the same per-fixture HTTP request; never make 19 requests for 19 bookmakers.

This is deliberately below Ultra's 40/min ceiling to leave capacity for other account services. If another service consumes the shared allowance, provider headers/429 take precedence and enrichment backs off rather than retrying aggressively.

### 2026-09-15 click fan-out incident — permanent ban

A per-fixture Full Market Worker was briefly introduced that used one provider request when a user expanded a match. That design was removed because public traffic would turn user clicks into provider load.

Permanent consequences:

- `workers/nomadtips3-343-full-market/` must not exist.
- Preview must not have a `FULL_MARKET` service binding.
- `/api/full-market/*` must remain disabled (`410`) rather than proxying a provider request.
- `full-market-bookmaker-343.js` must be network-free (`fetch()` forbidden) and expose `networkMode: NONE`.
- Per-fixture provider access is allowed only in the central scheduled HUB enricher described above.
- CI must fail if browser/Preview/Engine user traffic is wired back to per-fixture provider calls.

## Odds data completeness

Do not assume a single odds schema.

The bulk list can carry market lines as scalars:

- `asian_handicap.opening = -0.25`
- `goal_line.closing = 2.75`
- `corner_line.inplay = 10.5`

Central rich enrichment can add stage objects:

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
- Old rich values may remain as fallback if the current scheduled enrichment is rate-limited or temporarily unavailable; retain `richOddsUpdatedAt` so freshness can be audited.

## Bookmakers

The UI keeps the 19 canonical bookmaker slots in display order even when only some bookmakers are present in the central snapshot.

Bet365 is first. Additional bookmaker data is displayed only when it actually exists in the central fixture snapshot. Scheduled rich enrichment requests all 19 bookmakers in one per-fixture request and merges only data actually returned by the provider.

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

- Full Market browser renderer contains no network call.
- Click/expand and bookmaker-tab interactions produce 0 `/api/full-market/` resource requests.
- Per-fixture Full Market Worker and Preview `FULL_MARKET` binding are absent.
- `/api/full-market/*` is hard-disabled.
- Engine contains no direct provider URL and remains a snapshot consumer.
- HUB rich-odds provider URL exists only in the scheduled central enricher.
- HUB rich request max, total request budget and reserve threshold stay bounded.
- Public HUB `/snapshot` reads do not trigger a provider refresh.
- Expanded shell contains no second Odds renderer.
- Parser self-test covers scalar lines and rich stage objects without network access.
- Runtime Engine remains `BULK_SNAPSHOT_ONLY` with `externalOddsRequests = 0` from browser/Engine activity.
- Runtime HUB base snapshot uses `include=odds,events,stats`.
- Runtime HUB reports `richOdds.clickRequests = 0`.
- Expanded-card scrollbar/layout and 30-second DOM stability are browser-tested.
