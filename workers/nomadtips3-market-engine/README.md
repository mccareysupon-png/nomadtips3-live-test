# NOMAD 3.42 Market Engine

Independent optional market-data layer for NOMAD Live 3.42.

## Isolation contract

- Does **not** read or modify TotalCorner event data.
- Does **not** replace the existing 5Dollar / Bet365 price worker.
- Does **not** scrape `oddstorm.com` public HTML.
- Accepts only a configured, authorized JSON market-feed endpoint.
- Market outages are fail-open for the public Live Score/Event UI: `/markets` can fail while 3.42 event cards continue independently.
- NOMAD Live 3.41 is outside this worker and must remain untouched.

## Environment

- `MARKET_PROVIDER_ENDPOINT` — authorized JSON feed URL. Required for live market data.
- `MARKET_PROVIDER_TOKEN` — optional bearer token.
- `MARKET_PROVIDER_NAME` — display/source label; default `authorized-market-feed`.
- `MAX_MARKET_AGE_MS` — freshness ceiling; default 30000 ms.
- `MARKET_PROVIDER_TIMEOUT_MS` — upstream timeout; default 6000 ms.
- `MARKET_ALLOW_ORIGIN` — optional additional browser origin.

## Routes

- `GET /health` — configuration and isolation state. Never exposes token or full endpoint.
- `GET /markets` — normalized `market-v1` response.

## Canonical markets

Each match can contain bookmaker-level:

- `ah`: Asian Handicap lines (`line`, `homeOdds`, `awayOdds`)
- `oneXtwo`: 1X2 (`home`, `draw`, `away`)
- `totals`: Over/Under lines (`line`, `overOdds`, `underOdds`)

The normalizer removes stale quotes, chooses an `AUTO MAIN LINE` by weighted bookmaker coverage, calculates median display prices, and creates weighted referee consensus. Tier-A bookmakers have weight 2, Tier-B weight 1, and other fresh books weight 0.5.

## Rollout mode

Start as `DISPLAY ONLY`. Market consensus must not alter the existing 3.42 Event Gate or Prediction until separate validation/backtesting demonstrates value.
