# NOMAD CONTROL CENTER

Read-only executive operations dashboard.

## Version 2 scope
- Thai-first executive layout.
- Primary row: TotalCorner V3, Nowgoal, NOMAD Live Engine, Market Engine.
- Support row: TotalCorner V2, AsianBookie, API-Football, Goaloo/CAR 3.4, 5Dollar adapter.
- Nowgoal status is derived read-only from NOMAD Live `/feed` `priceSources`; no invented active percentage is used.
- Website checks include Home, Live Score, Signal, Statistics and Soccer Predictions.
- Maintenance suggestions are derived from monitor states only; there are no repair/restart buttons.
- Visitor Intelligence section is present but explicitly remains UNLINKED until a server-side Cloudflare Analytics / Visitor Pulse integration exists. No Cloudflare API token is stored in browser code.

## Safety contract
- Does not write Signal, Scout, odds, config, scheduler, D1, or engine state.
- Reads public health/feed/status endpoints only.
- Website probes are reachability-only from the browser.
- Incident history is browser-local (`localStorage`) only.
- Components without live telemetry are explicitly shown as unlinked/legacy rather than healthy.

## Refresh
- Automatic dashboard refresh: 10 seconds.
- Visibility return triggers an immediate refresh.
- Per-request timeout: 8 seconds.

## Workload
Workload is shown only when a usable activity counter exists. It is normalized against an explicit planning/configured cap displayed on each card; otherwise workload is shown as `—`. Nowgoal intentionally shows no load percentage because current telemetry measures price-source observations, not server capacity.

## Rollback
The feature remains isolated to `nomad-control-center/`.

Pre-v2 rollback point: commit `4ba0c3fd702540c4680d24add140a54630944b2b`.

No existing NOMAD Live, Signal, price-source or Production engine file is modified by this dashboard update.
