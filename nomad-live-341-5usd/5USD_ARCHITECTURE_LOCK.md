# 5USD Architecture Lock — NOMAD 3.41 Clean Clone

## Non-negotiable rule

**Viewer activity must never create 5DollarFootballAPI traffic.**

- 1 central provider poller owns all 5USD requests.
- 1 cycle = 1 full-board request.
- Match-card open/close, search, filter, expand, refresh, Statistics and Health views = **0 additional 5USD requests**.
- 3,000 card clicks by one viewer = 0 additional provider requests.
- 3,000 card clicks by each of 10,000 viewers = 0 additional provider requests.
- No component, card, page, derived engine, price referee or settlement module may call 5USD directly.
- No per-fixture fan-out.

Provider request for each cycle:

```text
GET /v1/fixtures?status=live&include=odds,events,stats&per_page=500
```

This is the only routine live-board provider call allowed by the architecture.

## Target architecture

```text
5DollarFootballAPI
        |
        |  ONE request per cycle
        v
CENTRAL PROVIDER POLLER
        |
        v
RAW FULL-BOARD SNAPSHOT
        |
        v
NORMALIZER
        |
        +-----------------------------+
        |                             |
        v                             v
SNAPSHOT HISTORY / RING BUFFER     CURRENT MARKET DATA
        |                             |
        v                             v
ROLLING 5' / DELTAS              PRICE REFEREE
PRESSURE / HUNGER                     |
CONDITION ENGINE                      |
        +-------------+---------------+
                      v
                 SIGNAL STATE
                      |
                      v
                  SETTLEMENT
                      |
                      v
            PUBLISHED NOMAD SNAPSHOT
                      |
          +-----------+-----------+
          |           |           |
          v           v           v
        LIVE      STATISTICS     HEALTH
          |
          v
       VIEWERS
```

## Request ownership

Only the **Central Provider Poller** may possess provider credentials or call 5USD.

The browser must never receive the 5USD bearer key.

The browser consumes only a NOMAD-owned snapshot endpoint/cache, for example:

```text
GET /api/nomad341/live
```

Refreshing this NOMAD endpoint is not a 5USD provider request. The endpoint serves the already-published snapshot.

## Cycle contract

Every provider cycle creates one immutable cycle envelope:

```js
{
  cycleId,
  fetchedAt,
  provider: '5USD',
  requestCount: 1,
  hasMore,
  rawCount,
  matches: [...]
}
```

All score, minute, stats, events, odds and bookmaker values used for that decision cycle must come from this same full-board response.

Do not mix match facts from one provider cycle with market values from another cycle unless explicitly using retained history for trend calculations.

## Snapshot history

The central runtime retains recent snapshots by fixture id. Rolling windows and event deltas are calculated from stored cumulative values; they never trigger provider calls.

Example:

```text
Cycle A  10:00:00
Cycle B  10:00:15
Cycle C  10:00:30
...

Current cumulative stats - historical cumulative stats = rolling delta
```

The history service supplies Rolling 5', SOT delta, Shot Off delta, Corner delta, Attack delta, pressure and hunger.

## Price Referee

Price Referee is a pure calculation step over bookmaker/market data already present in the current full-board snapshot.

Rules:

- no fetch
- no per-match provider request
- no retry call for a missing/null price
- if a value is unavailable or unchanged, wait for the next normal full-board cycle
- price age is derived from provider timestamps/cycle timestamps where available

## Signal engine

Signal classification is server-driven, not viewer-driven.

```text
WATCHING -> NEAR SIGNAL -> CANDIDATE -> SIGNAL
```

Opening a card never runs a provider fetch and never changes provider polling cadence.

## Settlement

Signal entry data is locked locally. Subsequent normal full-board cycles provide score/status updates. Settlement waits for the normal finished state and uses the stored entry line/odds plus final score. It must not issue a special provider request.

## Request governor

The provider gateway must enforce:

- maximum concurrent provider requests: 1
- scheduled polling only
- if the prior poll is still active: skip the next trigger rather than overlap
- 429: obey Retry-After; do not fan out or blind retry
- successful response: observe X-RateLimit-Limit / Remaining / Reset
- no browser-triggered provider execution
- no per-fixture provider path in the normal runtime

## `has_more`

The normal design assumes the full live board fits inside `per_page=500`.

If `has_more=true`, raise a Health warning. Do not silently create a second provider request inside the normal one-request-per-cycle architecture without an explicit architecture change.

## Browser contract

The browser receives normalized NOMAD data only. Card actions are local UI operations over the latest published snapshot.

```text
click card       -> local expand       -> 0 provider calls
close card       -> local collapse     -> 0 provider calls
filter/search    -> local calculation  -> 0 provider calls
change tab       -> cached snapshot    -> 0 provider calls
3,000 clicks     -> local UI only      -> 0 provider calls
```

## Deployment gate

Do not enable live 5USD traffic until all of the following are true:

1. Central poller/proxy exists server-side.
2. Provider key is stored only as a server secret.
3. One-request-per-cycle governor is active.
4. Published snapshot endpoint is available.
5. Client adapter points only at the NOMAD snapshot endpoint.
6. Browser code contains no 5USD URL/key/provider fetch.
7. Request counters are visible in Health.
8. A synthetic click test confirms thousands of card interactions do not change provider request count.

Until these gates pass, the clone remains on mock/normalized data.
