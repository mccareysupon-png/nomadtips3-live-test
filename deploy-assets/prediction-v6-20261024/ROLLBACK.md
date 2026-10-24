# Prediction Vote V6 rollback

Baseline: `ball46-production` version `718d4481-36b9-438c-8eff-8f9b42a30934`, deployment `d462bcb1-9005-473d-b5ca-a8b11fd69690`. This preserves the current sidebar, match/market UI, Event Flow, Performance and all original modules/assets.

Owned candidate: `4c40159f-84a2-400c-80dc-8b13c268c898`, tag `B46_PREDICTION_V6_20261024`.

Use only the guarded workflow `.github/workflows/ball46-prediction-v6-20261024.yml` on `codex/ball46-prediction-v6-20261024`. Re-read actual active version, registry366, bindings, routes/domains/schedules and exact candidate modules first. Do not restore over a newer deployment. Refresh authenticated routes evidence. Set `request.json` phase `restore`, exact baseline/candidate and fresh route audit; commit with compare-and-swap branch update. The runner refuses a different current version/config/ownership and verifies public response convergence after switching100% traffic.

Rollback does not delete vote data, the isolated backend, either SQLite namespace or the existing staged KV namespace. The new service can remain private and unused. No rollback touches Engine343, HUB, Full Market, Ledger, SIGNAL, Statistics or Member. Do not activate the obsolete V5 candidate548de7db or its dc158 baseline.

The activation runner automatically attempts the same owned-baseline restore if post-cutover static hashes, APIs, config or prior SETTLED fingerprints fail. If another deployment becomes current, it stops rather than overwriting that deployment.
