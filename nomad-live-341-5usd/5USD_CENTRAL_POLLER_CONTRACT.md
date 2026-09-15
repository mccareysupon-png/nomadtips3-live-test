# 5USD Central Poller Contract — Pre-integration

This document defines the server-side integration point that will be implemented before live 5USD traffic is enabled.

## Purpose

The Central Poller is the **only component allowed to call 5DollarFootballAPI**.

Its responsibilities are:

1. issue one full-board provider request per scheduled cycle
2. validate the response
3. attach cycle metadata
4. normalize provider fields into NOMAD fields
5. update snapshot history
6. run derived calculations
7. run price-referee logic against the same snapshot
8. update signal state
9. settle completed signals from normal future cycles
10. publish one read-only NOMAD snapshot for all viewers

## Routine provider request

```text
GET /v1/fixtures?status=live&include=odds,events,stats&per_page=500
```

Expected architecture invariant:

```text
providerRequestsThisCycle === 1
```

No page view, card click, card expansion, filter, search or Statistics/Health navigation may invoke this function.

## Runtime stages

```text
SCHEDULED TICK
   |
   v
REQUEST GOVERNOR
   |
   |-- busy? -> skip tick
   |
   v
ONE FULL-BOARD FETCH
   |
   v
VALIDATE RESPONSE
   |
   v
CREATE CYCLE ENVELOPE
   |
   v
NORMALIZE ALL MATCHES ONCE
   |
   +--> SNAPSHOT HISTORY
   |       |
   |       v
   |    ROLLING / DELTAS
   |
   +--> CURRENT ODDS / BOOKMAKERS
   |       |
   |       v
   |    PRICE REFEREE
   |
   +--> SCORE / STATUS / EVENTS / STATS
           |
           v
       CONDITION ENGINE
           |
           v
       SIGNAL STATE
           |
           v
       SETTLEMENT
           |
           v
PUBLISH NOMAD SNAPSHOT
```

## Cycle envelope

```js
{
  cycleId: '...',
  fetchedAt: 'ISO-8601',
  provider: '5USD',
  providerRequestCount: 1,
  rateLimit: {
    limit: null,
    remaining: null,
    reset: null,
    retryAfter: null
  },
  hasMore: false,
  rawCount: 0,
  normalizedCount: 0,
  counts: {
    live: 0,
    watching: 0,
    near: 0,
    candidate: 0,
    signal: 0
  },
  matches: [],
  ledger: [],
  health: {}
}
```

## Request governor

Required behavior:

```text
MAX_CONCURRENT_PROVIDER_REQUESTS = 1
```

If a scheduled cycle fires while another provider fetch is still running, skip the new cycle. Never overlap.

On HTTP 429:

- read `Retry-After`
- expose the condition in Health
- do not fan out
- do not immediately retry in a loop
- keep the last good published snapshot available to viewers

On HTTP 200:

- capture `X-RateLimit-Limit`
- capture `X-RateLimit-Remaining`
- capture `X-RateLimit-Reset`
- publish the new snapshot only after validation/normalization succeeds

## `has_more`

If `has_more=false`, normal operation.

If `has_more=true`, publish a Health warning such as:

```text
LIVE_BOARD_OVER_500
```

Do not automatically issue a second provider request in the normal architecture. Any future change to that rule requires an explicit architecture decision.

## Normalization responsibilities

The server-side normalizer converts provider-specific names into stable NOMAD names once per cycle. The browser should not need to know provider field names.

Target core fields include:

```text
fixture id
league
home / away
status / minute
score
corners
cards
attacks
dangerous attacks
shots on target
shots off target
possession
events
odds / markets / bookmakers
provider timestamps where available
```

Missing provider statistics remain distinguishable from numeric zero.

## Snapshot history

History is keyed by fixture id and retains enough central snapshots for rolling calculations.

The history service must survive viewer page refreshes. Therefore production history belongs server-side or in persistent runtime storage, not only in the browser.

Rolling calculations use historical snapshots already collected by the regular poller and add zero provider requests.

## Price Referee rule

The Price Referee receives the current cycle's normalized market/bookmaker data.

It may:

- validate line
- validate selected side
- validate odds range
- compare bookmaker prices
- evaluate price age/timestamps
- choose the best valid price

It may **not** fetch additional provider data.

If a required value is missing/null, the candidate waits for the next standard full-board cycle.

## Viewer delivery

All viewers read a published NOMAD endpoint/cache such as:

```text
GET /api/nomad341/live
```

This endpoint returns the latest already-computed state. It must not trigger the provider poller synchronously.

Correct behavior:

```text
viewer request -> read current cache -> respond
```

Forbidden behavior:

```text
viewer request -> call 5USD -> respond
```

## Telemetry required before activation

Health should display at least:

```text
cycle id
last provider fetch
provider requests this cycle
provider requests current minute/window
rate-limit limit
rate-limit remaining
rate-limit reset
last 429
last Retry-After
live match count
has_more
snapshot age
engine cycle duration
viewer requests (optional, separate from provider requests)
```

This makes it immediately visible if a future code change accidentally creates extra provider traffic.

## Pre-activation test

Before live provider traffic is enabled:

1. run against mock full-board payload
2. confirm one scheduled cycle produces one provider-gateway invocation
3. simulate 500 match cards
4. expand/collapse cards thousands of times
5. navigate Live / Statistics / Health repeatedly
6. verify provider-gateway invocation count does not change
7. simulate concurrent viewers
8. verify provider-gateway invocation count still follows schedule only
9. simulate a slow provider response and verify overlapping tick is skipped
10. simulate 429 and verify last good snapshot remains available

Only after these invariants pass should the provider secret and live endpoint be enabled.
