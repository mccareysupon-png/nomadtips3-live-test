# NOMAD Live Score Feed V2

Isolated live-score carrier for Page 3.

Flow:

`TotalCorner /match/today/ -> this Worker -> /feed -> NOMAD Page 3`

Design rules:

- Today-only ingestion. No TotalCorner detail fetches.
- No production bridge, EVENT_ENGINE binding, browser last-good cache, or canary routing.
- Contract remains version 3.42 so the existing Page 3 renderer can consume it without UI changes.
- This Worker is isolated from Page 1 and NOMAD Live 3.41.
- Source failures are reported as `ok:false`; they are not hidden as fresh data.

Endpoints:

- `GET /health`
- `GET /feed`
- `GET /contract`
