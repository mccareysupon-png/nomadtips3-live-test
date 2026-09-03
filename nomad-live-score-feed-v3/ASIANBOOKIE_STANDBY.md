# AsianBookie standby line for NOMAD Live Page 3

Status: **SCOUT / DORMANT / NOT WIRED TO RUNTIME**

Branch: `work/asianbookie-live-score-scout-20260903`

## Objective

Prepare an isolated AsianBookie fallback path that can be mapped into the existing Page 3 live-score contract without changing Page 3 UI or the active TotalCorner V3 receiver.

## Confirmed AsianBookie data points already present in NOMAD

Existing Market adapter uses:

- Base: `https://beta.asianbookie.org`
- Match/tipster poll: `GET /api/poll/tipster`
- Match odds poll: `GET /api/poll/tipsterMatchOdds`
- Public live page: `https://beta.asianbookie.org/en/live`

The existing AsianBookie Market adapter already knows aliases for match ID, home team, away team, league, minute and score, then joins odds by match ID.

## Important production history

On 2026-08-31, direct Worker polling of the two AsianBookie XHR endpoints was intentionally parked after two production probes returned empty/non-JSON responses. The adapter/tests were retained, but active polling was disabled. Do **not** re-enable those Market Worker defaults as part of this scout.

## Page 3 target contract

The current Page 3 TotalCorner V3 feed expects each match to normalize into:

- `id`
- `league`
- `home`
- `away`
- `minute`
- `score: [home, away]`
- `event.snapshots[]`
  - `minute`
  - `observedAt`
  - `attacks: [home, away]`
  - `dangerous: [home, away]`
  - `sot: [home, away]`
  - `off: [home, away]`
  - `corner: [home, away]`
- `freshness`

`src/asianbookie-standby.js` is a pure normalizer for captured/authorized JSON payloads. It performs **no network requests** and is **not imported** by `src/index.js`.

## Field scout matrix

| NOMAD Page 3 field | AsianBookie status | Scout action |
| --- | --- | --- |
| Match ID | Known alias support | Verify against live payload |
| Home / Away | Known alias support | Verify against live payload |
| League | Known alias support | Verify against live payload |
| Minute | Present in existing match adapter aliases | Verify freshness / stoppage time behavior |
| Score | Present in existing match adapter aliases | Verify live updates |
| Attacks | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |
| Dangerous attacks | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |
| SOT | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |
| Shot off | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |
| Corners | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |
| Event timeline | Endpoint/field not yet confirmed | Capture live-page XHR/fetch payload |

## Safe scouting sequence

1. Keep TotalCorner V3 active and unchanged.
2. Inspect requests made by AsianBookie's `/en/live` page in a normal browser session.
3. Record only the live-data requests needed for score/statistics/events: URL/path, method, query parameters, required request headers, response content type, refresh cadence and one redacted sample payload.
4. Feed captured JSON into `normalizeAsianBookieLivePayload()` and inspect diagnostics/field coverage.
5. Add fixtures/tests only after the real field names are confirmed.
6. If coverage is sufficient, deploy a **separate shadow Worker** first. Do not change Page 3 source selection yet.
7. Compare AsianBookie shadow output with TotalCorner V3 for match identity, minute, score and statistics across multiple cycles.
8. Only after parity is proven, add AsianBookie as fallback behind the existing Page 3 feed contract.

## Rollback / safety point

This branch is isolated from `main`. No Page 3 runtime file, Worker route, DNS, production source selector or TotalCorner V3 logic is changed by this scout.
