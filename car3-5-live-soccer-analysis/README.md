# CAR 3.5 — Live Soccer Analysis

CAR 3.5 is an isolated live-analysis engine and presentation package. Its live feed, settings, signal archive, settlement and statistics all use the CAR 3.5 Worker/Durable Object only.

## Product structure

1. **Live soccer analysis** — live list, match center, source-driven event visualization and engine pressure history.
2. **Statistics** — CAR 3.5 SQLite signal archive with Win/Loss/Draw, win rate, average odds, net units, range filters and pagination.
3. **Live alerts** — signal information and access to the CAR 3.5 settings page. Checkout/payment is intentionally not connected to this preview.
4. **Owner control** — no owner key; settings are written to CAR 3.5, read back from the Worker, and only then shown as active.

## Data and engine

- Match index and statistics are read directly from the live source.
- Live odds source is selected by `bookmakerCompanyId`: Bet365 = 8, 1xBet = 50. The selected source never silently falls back to another bookmaker.
- Markets: WIN/1X2, Asian Handicap and Over/Under.
- Asian Handicap preserves the sign of the selected-team line; positive and negative lines are different conditions.
- Over/Under requires the live line to match the configured goal line.
- Momentum, evidence, goal-gap, red-card, freshness, confidence, core-stat and daily-limit gates are enforced by the engine.
- Daily signal limits use Thailand time (UTC+7).
- Confirmed records lock market, line, odds, entry minute and entry score before settlement.

## Storage

CAR 3.5 uses its SQLite-backed Durable Object for long-term signal history. Existing legacy history is migrated once into the SQL archive and future history is no longer truncated to the previous 1,000-record working list.

## Visualization

Exact source XY coordinates are used when available. Without XY, a source event may be mapped to a fixed event zone. The ball does not move while no new source coordinate/event is received.

## Deployment integrity

The CAR 3.5 deployment workflow validates syntax, setting-to-engine contracts, bookmaker routing, AH sign behavior, O/U line behavior, absence of CAR 3.1 Worker references, absence of payment/checkout files, no-key configuration writes, CAR 3.5 history storage and live-feed health before considering the preview healthy.
