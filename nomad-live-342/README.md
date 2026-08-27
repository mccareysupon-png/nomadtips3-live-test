# NOMAD Live 3.42 — M88 Single-Judge Test Build

## Decision flow

`TotalCorner → Event → Candidate → M88 Direct Observer → RAW HDP → Decode / Normalize → Freshness → เซียน K Final Judge → Signal / WAIT`

## M88 observer evidence

The M88/MSports Live Soccer page was verified in a browser without login. The observer can identify:

- HOME / AWAY teams
- live minute and score
- FT HDP market
- raw handicap line
- two-sided Hong Kong odds
- live price changes
- JavaScript-rendered DOM structure

Example observation:

`Strommen IF vs Raufoss IL | 1H 16' | 0-0 | HOME RAW HDP 0.5 | HK 0.85 / 1.05`

## Price rules

- Preserve RAW HDP and RAW Hong Kong odds first.
- Convert Hong Kong odds to decimal for the price gate (`0.85 HK → 1.85 decimal`).
- HOME AH `0` is sign-safe.
- Explicitly signed non-zero lines may be normalized from the visible sign.
- Unsigned non-zero HDP remains `UNKNOWN` until its HOME/AWAY side-sign rule is proven.
- `UNKNOWN`, `UNAVAILABLE`, `STALE`, and `MISMATCH` produce WAIT.
- Empty line or price fields remain unavailable until their market state is known.
- Allowed HOME AH lines can be set to ANY or a selected quarter-goal list.
- Minimum odds, optional maximum odds, freshness age and one-signal-per-match are configurable.

## Browser storage

- Settings: `nomadSettings342`
- Signal ledger: `nomadLedger342`
- M88 observation: `nomadM88Observation342`

## Test boundary

The current page uses controlled event and M88 snapshots to test the complete decision logic. `m88-observer.js` validates source state, keeps raw evidence, normalizes Hong Kong odds and applies cautious HDP decoding before the price gate.

## Central persistence blueprint (Git branch)

The live browser build still uses its existing LocalStorage keys during the transition. The new isolated backend blueprint is `../nomad-live-engine-342/`.

Target flow:

`TotalCorner -> NOMAD -> M88 -> SIGNAL LOCK -> Worker -> D1 -> Statistics / History / Health`

Do not switch Statistics or Signal Lock to server mode until a real 3.42 D1 binding is provisioned and the new API passes validation. During cutover, dual-write and compare counts first.
