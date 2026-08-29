# NOMAD Live 3.42 — 5Dollar / Bet365 Price Build

## Decision flow

`TotalCorner → Event → Candidate → 5DollarFootballAPI → Bet365 LIVE AH → Validate / Normalize → Price Gate → Final Signal / WAIT`

## Active price path

NOMAD Live 3.42 now uses the standalone external price adapter at:

`nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev`

The adapter reads **Bet365 Full Match LIVE Asian Handicap** prices from 5DollarFootballAPI and returns a fail-closed quote contract to the 3.42 browser runtime.

- Provider: `5DollarFootballAPI`
- Bookmaker: `Bet365`
- Market: `FULL MATCH LIVE AH`
- Side used by NOMAD: `HOME`
- Maximum quote batch: `7` candidate matches per cycle
- Low-confidence or ambiguous fixture mapping: `WAIT`
- Missing/invalid price: `WAIT`
- Adapter/API error or timeout: `WAIT`
- Price outside configured line/odds limits: `WAIT`

## Event source

TotalCorner remains the 3.42 Match/Event source. The event engine and its rolling-window HOME pressure/evidence logic are unchanged by this price-source swap.

## Timestamp semantics

5Dollar currently does not expose an authoritative Bet365 upstream price-update timestamp in the quote snapshot used by this adapter. The adapter therefore marks the observation time as `adapter_observed_at`. NOMAD treats that timestamp as adapter observation age only; it must not be described as the Bet365 exchange/update time.

## Browser storage

- Settings: `nomadSettings342`
- Signal ledger: `nomadLedger342`
- Signal archive: `nomadSignalArchive342`

Locked signals store `source: Bet365` and `priceProvider: 5DollarFootballAPI`.

## Retired browser-referee path

The old `m88-*` and direct `bet365-*` browser observer/extension files are retained only as rollback/archive material. They are **not loaded by the active 3.42 Live, Settings, or Health pages**.
