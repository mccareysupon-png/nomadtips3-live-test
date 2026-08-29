# NOMAD Live 3.42 — THScore Single-Judge Build

## Decision flow

`TotalCorner → NOMAD Event Gate → Candidate → THScore Match Mapper → Live AH Price Judge → Freshness / Line / Odds Gates → Signal / WAIT`

## Source roles

- **TotalCorner** remains the primary Match/Event source.
- **THScore** is the price judge only and does not replace the TotalCorner event inlet.
- THScore API credentials stay server-side in the isolated 3.42 Cloudflare Worker.

## Match Mapper

The mapper is fail-closed and uses multiple independent checks rather than a raw team-name equality check:

- normalized HOME and AWAY names, including common abbreviation cleanup
- HOME/AWAY orientation guard
- league similarity
- estimated kickoff proximity
- exact live-score cross-check before accepting a price
- confidence threshold plus ambiguity gap

Low-confidence, ambiguous, swapped, stale or score-mismatched records produce `WAIT`; they are never force-matched.

## Price rules

- THScore live Asian Handicap is normalized to NOMAD's HOME AH convention.
- Only quarter-goal-compatible handicap lines are accepted.
- RAW price evidence is retained together with normalized decimal price.
- Unverified odds format, missing change time, stale price, closed market, unavailable bookmaker, mapper mismatch or API error all produce `WAIT`.
- Allowed HOME AH lines can be ANY or a selected quarter-goal list.
- Minimum odds, optional maximum odds, freshness age and one-signal-per-match remain configurable.

## Worker contract

- Event feed: `GET /feed`
- THScore judge status: `GET /judge/thscore/status`
- THScore batch judge: `POST /judge/thscore`
- Batch maximum: 50 candidates

If the server-side `THSCORE_API_KEY` is absent, the judge reports unconfigured and remains fail-closed.

## Browser storage

- Settings: `nomadSettings342`
- Signal ledger: `nomadLedger342`
- Signal archive: `nomadSignalArchive342`

The legacy `m88-observer.js` file may remain in the repository for rollback history, but the THScore live page does not load or use it.
