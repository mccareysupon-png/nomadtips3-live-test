# BALL46 cached screen refresh: review candidate only
Production was read from Cloudflare: website 88dce0f2-40e2-4725-ae7c-22d84c946724.
Original dashboard SHA256 b5991143b8bda922335562126a3d084f0aa7a0b8651bdd43e6d961959fd6e337.
Candidate dashboard SHA256 fd6202e8154f7ee6dd3c1b1bd589ef64e2580781cbb70bdadd8d6a68e2c82d50.

Only planned public asset: /dashboard-v2-stage3-featured-facts-20261013a.js.
No Production upload, deployment, traffic, settings or state writes were performed.

Why an additive display reader: /api/engine/board is not read-only upstream. Its Engine /board handler calls scanIfDue(), so accelerating that endpoint could alter scan timing. Original board (30s), signals (30s), statistics settlement (60s), Event Flow and odds loops remain unchanged.
The new 5s reader uses the existing /api/hub/snapshot route. Current HUB's exported viewer-safe snapshot override reads stored meta/state/control/rows only and returns cacheOnly:true and externalRequestsAdded:0. No new endpoint, provider key, Worker config or Engine source changes.

The patch projects only valid time/status/score fields onto already-known fixture IDs, preserving odds, events, signals, fixture count and membership. It accepts real score corrections in both directions. Snapshot timestamp/age checks reject stale or older data. Original board responses are merged with newer cached live scores to avoid regression. A timer and in-flight guard prevent overlapping fetches; hidden tabs pause and visibility restoration reads immediately.

Native text nodes update in place. This avoids waking the expanded Event Flow's childList observer and sending additional Engine reads. Mobile and voting mirrors follow the existing DOM; Statistics reads the existing dashboard getFixture() store. Grouping/counters still follow the original board loop.

Cost: approximately 12 extra same-origin cache reads per active viewer tab per minute, plus initial/resume reads. This does not change the server's 5USD cadence or upstream arrival latency. Snapshot response bandwidth and Cloudflare requests rise.

Tests use clearly isolated fictional fixture data and intercept all API/provider traffic; actual production asset files are loaded for UI behavior. Production match data is not changed or manufactured. The localhost preview is marked as simulated.

Before any authorized deployment: reread the active website version, settings/bindings/routes/Cron and current dashboard hash. If anything changed, stop and rebase from fresh Production. Preserve every current module, binding, route and asset, and change only this public JavaScript asset through the established current-bundle upload procedure. Do not deploy this branch wholesale.

Rollback: restore the single original dashboard asset, retaining all current other assets/modules/settings. Full Worker rollback to captured 88dce0f2 is only appropriate if that version is still the immediate approved predecessor and no unrelated changes occurred. No rollback action has been executed.
