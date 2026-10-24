# Prediction V8 guarded rollback

Production baseline: `ball46-production` version `4c40159f-84a2-400c-80dc-8b13c268c898`, deployment `b0afb14a-3383-48c0-8c2f-23781f89ef32`. It includes the verified sidebar, previous six jerseys, actual vote backend, Performance, Event Flow and current match/market presentation.

Owned candidate: `3d9e0ad6-6b23-4abe-9981-4c8d3fbd4eda`, tag `B46_PREDICTION_V8_20261024`. Source branch `codex/ball46-prediction-v8-20261024`; workflow `.github/workflows/ball46-prediction-v8-20261024.yml`. Code and UI changes are scoped under `deploy-assets/prediction-v8-20261024/`.

Before any rollback, independently read actual active version, settings, bindings, domain/routes, schedules and backend-service versions. Only set request phase `restore` if current active is still the owned candidate and configuration matches its audit. Use a fresh authenticated route audit and a compare-and-swap branch update. The runner refuses drift, verifies candidate ownership/modules, switches only this Worker and checks public convergence/bytes.

The activation phase automatically attempts the same guarded restore if post-cutover bytes, health, configuration or previous SETTLED fingerprints fail. It stops if another deployment has become current. Vote data, cookies, signed identities, private backend, SQLite namespaces, staged KV and all football systems remain intact. Never use obsolete V5/V6 predecessor rails or delete votes to roll back this UI.
