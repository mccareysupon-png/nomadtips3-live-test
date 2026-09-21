# Ball46 Golden Master — 2026-09-21

Canonical production reference:

- URL: https://www.ball46.com/index.html
- Git commit: `2a992e9aae7bfa13909e9c5b3845a359bf1ec46c`
- Frozen branch: `golden/ball46-odds-master-20260921`

This revision is the Golden Master because Page 1 displays the bookmaker odds set correctly in the default cards.

## Protected runtime

The following files/services must remain byte-identical to the Golden Master unless an explicit odds/backend change is requested:

- `workers/nomadtips3-343-preview/src/index.js`
- `workers/nomadtips3-343-preview/wrangler.ball46.jsonc`
- `workers/nomadtips3-engine-343/src/index.js`
- `nomad-live-343/dashboard-v2-stage3.js`
- `nomad-live-343/dashboard-v2-tune.js`
- `nomad-live-343/bulk-odds-compat-343.js`
- `nomad-live-343/expanded-match-343.js`
- `nomad-live-343/full-market-bookmaker-343.js`
- `nomad-live-343/live-summary-full-odds-343.js`
- `nomad-live-343/signal-next.js`

Production service bindings must remain:

- ENGINE → `nomadtips3-engine-343`
- HUB → `nomadtips3-5usd-hub-343`
- FULL_MARKET → `nomadtips3-full-market-343-ball46`

## Extension rule

New Signal / Statistics / market-condition UI is layered around the Golden Master. New static registries must not fetch providers, start polling timers, replace the bookmaker renderer, or own the Page 1 odds lifecycle.

Any production deployment must verify Board health and odds continuity before and after deployment and automatically restore the Golden Master if continuity fails.
