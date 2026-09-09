# NOMAD LIVE 3.42 — Shot Sidecar Contract V1

Status: prepared, isolated, display-only.

- Live display plug: `shot-stats-342.js` (not connected to detector).
- Settings preparation: `shot-settings-status-342.js` exports a mount API but is intentionally not loaded by `settings.html` yet.
- Worker: `workers/nomadtips3-shot-sidecar-342`.
- Future detector port: contract marker only; `detectorConnected:false`.
- Existing market setting keys such as `shotOnTarget`, `shotOff`, and `evidenceRequired` are not read or written by this sidecar.
- No writes to 3.42 feed, candidate layer, signal engine, ledger, statistics, settlement, or K Rules.
