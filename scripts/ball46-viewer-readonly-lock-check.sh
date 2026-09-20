#!/usr/bin/env bash
set -euo pipefail
js=nomad-live-343/live-summary-full-odds-343.js
gateway=workers/nomadtips3-343-preview/src/index.js
engine=workers/nomadtips3-engine-343/src/index.js
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' "$js"
grep -Fq "const API='/api/full-market/board-cache'" "$js"
! grep -Fq '/api/full-market/fixture-odds' "$js"
! grep -Fq 'applyRichOdds' "$js"
! grep -Fq 'providerOdds:' "$js"
grep -Fq 'VIEWER_PROVIDER_FETCH_DISABLED' "$gateway"
grep -Fq 'VIEWER_ENGINE_TRIGGER_DISABLED' "$gateway"
grep -Fq "path === '/board-cache'" "$gateway"
! grep -Fq "env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'))" "$gateway"
grep -Fq 'BALL46_VIEWER_READONLY_LOCK_V1' "$engine"
! grep -Fq 'await this.scanIfDue();' "$engine"
grep -Fq 'crons = ["* * * * *"]' workers/nomadtips3-engine-343/wrangler.toml
echo BALL46_VIEWER_READONLY_LOCK_V1_SOURCE_PASS
