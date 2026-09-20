# Ball46 Full-Market 19-book reference-view experiment

Status: ISOLATED / NO PRODUCTION DEPLOY

Architecture lock: Bet365 untouched; engine viewer endpoints stay blocked; exactly one upstream request contains all 19 bookmakers; no per-bookmaker upstream fetch; shared Full-Market gate/cache/dedupe owns provider fetches; expanded cards may read rich Full Odds; Signal must not prefetch/merge rich odds into compact providerOdds; compact numeric odds stay masked; Engine/referee/conditions unchanged; UI unchanged.

Experiment path:
provider -> one 19-book response -> shared Full-Market cache -> derived cached bookmaker views[bookmaker]

Each view is only an index/reference into the same cached response, never a network fetch. Bet365 is the behavioral baseline. Other bookmaker views use the same cache generation and source timestamp when present.

Acceptance: upstream call count unchanged; no fetch loop per bookmaker; same cache generation across views; expanded rich odds resolve without provider request; compact/default state unchanged; Signal rich prefetch=0 and rich-to-providerOdds merge=0; Engine/referee/condition diff=0; UI diff=0; rollback removes only derived-view layer.

Measure: upstream request count, generation id, provider timestamp, bookmaker count, Bet365 ready latency, other bookmaker ready latency, cache hit/miss and dedupe hit/wait. Never log secrets.