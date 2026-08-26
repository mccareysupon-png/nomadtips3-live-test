# NOMAD Live 3.42 — M88 Single-Judge Test Build

This directory is an isolated 3.42 test project inside the existing GitHub Pages test repository. Files under `nomad-live/` (3.41) are not modified.

## Current decision flow

`TotalCorner → Event → Candidate → M88 Direct Observer → RAW HDP → Decode / Normalize → Freshness → เซียน K Final Judge → Signal / WAIT`

There is no multi-bookmaker quorum or consensus in the current test build. M88 is the only active price-judge module.

## M88 scout evidence already proven

The Official M88/MSports Live Soccer page was verified in a real browser without login. The scout observed:

- HOME / AWAY team structure
- live minute and score
- FT HDP market
- separate line and two-sided Hong Kong odds
- live odds changes over multiple refreshes
- JavaScript-rendered React DOM inside the Official M88/MSports page

Example verified scout snapshot:

`Strommen IF vs Raufoss IL | 1H 16' | 0-0 | HOME RAW HDP 0.5 | HK 0.85 / 1.05`

The scout did not prove the transport layer as XHR versus WebSocket, so the implementation does not invent an endpoint.

## Fail-closed M88 rules

- Preserve RAW HDP and RAW Hong Kong odds before normalization.
- Convert Hong Kong odds to decimal only for the NOMAD odds gate (`0.85 HK → 1.85 decimal`).
- `0` is sign-safe and may normalize to HOME AH `0`.
- An explicitly signed non-zero line may normalize using the visible sign.
- An unsigned non-zero M88 HDP such as `0.5` is `UNKNOWN` until the HOME/AWAY sign rule is independently proven.
- `UNKNOWN`, `UNAVAILABLE`, `STALE`, and `MISMATCH` all produce WAIT / no signal.
- Empty line/odds fields are not labelled SUSPENDED until that state is separately proven.

## Isolation

- Settings key: `nomadSettings342`
- Signal ledger key: `nomadLedger342`
- M88 observation key: `nomadM88Observation342`
- No 3.41 engine endpoint or storage key is referenced.
- No credentials are stored in the repository or browser settings namespace.

## Current static-preview boundary

`m88-observer.js` is the adapter boundary. It validates source state, preserves RAW evidence, normalizes Hong Kong odds, performs fail-closed HDP decoding, and exposes an observation intake slot.

The GitHub Pages preview does not itself read the current M88 page. A separate permitted browser capture step can later feed live observations into the adapter without changing the judging pipeline.

The Event side is still represented by isolated fixtures in this static preview. The fixtures now calculate rolling-window pressure and trend from raw event snapshots so the Event settings actually affect the decision instead of relying on precomputed pass values.
