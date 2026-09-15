# NOMAD 3.41 · 5USD Staged Runtime Readiness

Branch: `work/341-ui-clone-5usd-staged-runtime`

## Current safety state

- Browser mode: `PREVIEW_MOCK`
- Live provider flag in browser config: `false`
- Central provider environment flag: must be explicitly set to `true` before any live provider fetch can occur
- Provider secret: **not stored in this repository**
- 5USD live traffic: **DISABLED**
- 3.43: **untouched**
- No PR, merge or production deployment is part of this staging branch

## Prepared provider connection

The central runtime has exactly one staged provider URL:

```text
GET https://api.5dollarfootballapi.com/v1/fixtures?status=live&include=odds,events,stats&per_page=500
```

Routine provider access is owned only by `server/worker-staged.js`.

The worker refuses to call the provider unless BOTH conditions are true:

1. `NOMAD341_LIVE_PROVIDER_ENABLED=true`
2. server-side `FIVEUSD_API_KEY` exists

When the live-provider flag is false, the exact same central pipeline consumes `server/mock-fullboard.js` and reports `providerRequestCount: 0`.

## Runtime pipeline prepared

```text
Central cycle
  -> request governor (max one in-flight cycle)
  -> mock full-board now / one 5USD full-board request after explicit activation
  -> normalize once
  -> persistent central history
  -> rolling 5m / deltas
  -> pressure / hunger / evidence
  -> price referee using current snapshot only
  -> condition / signal lock
  -> ledger / settlement module
  -> publish latest NOMAD snapshot
  -> /api/nomad341/live
  -> all viewers
```

Viewer activity never starts a provider cycle. `/api/nomad341/live` only reads the latest published state.

## Provider-request invariants

```text
Preview/mock cycle          = 0 provider requests
Activated live cycle        = 1 provider request
Card expand/collapse        = 0 provider requests
Live page views             = 0 provider requests
Statistics page views       = 0 provider requests
Health page views           = 0 provider requests
Search/filter interactions  = 0 provider requests
```

No per-fixture fan-out exists in the staged runtime.

## Price freshness

Provider price timestamps are never replaced with the local fetch timestamp.

If a quote has no usable provider timestamp:

```text
priceAgeSeconds = null
reason = AGE_UNKNOWN
status = WAIT
```

It cannot pass the Price Referee.

## Persistence

Production activation should bind `NOMAD341_STATE` to durable server-side storage so rolling history, signal locks and ledger survive Worker/runtime restarts. The staged worker has an in-memory fallback only for isolated testing.

## Browser cut-over

Current browser config remains:

```text
mode = PREVIEW_MOCK
```

After the central snapshot runtime is deployed and validated in mock mode, the browser can be switched to:

```text
mode = CENTRAL_SNAPSHOT
```

That switch installs `fiveusd-snapshot-adapter.js` and disables browser-side derived/referee/settlement execution. Browser pages then become read-only consumers of the central snapshot.

This browser cut-over still does **not** require enabling 5USD live traffic; Central Snapshot can be tested with mock data first.

## Live activation — intentionally NOT performed

Only after explicit approval:

1. deploy/bind the central runtime and durable state
2. validate Central Snapshot in mock mode
3. store `FIVEUSD_API_KEY` as a server-side secret
4. explicitly set `NOMAD341_LIVE_PROVIDER_ENABLED=true`
5. run one controlled live cycle and verify `providerRequestCount === 1`
6. verify card clicks/viewers do not change provider request count

Until those activation steps are explicitly approved, the staged branch remains zero-provider-traffic by design.
