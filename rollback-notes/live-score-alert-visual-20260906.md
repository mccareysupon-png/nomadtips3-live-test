# Live Score compact alert visual rollback — 2026-09-06

Scope: `nomad-live-342/index.html` presentation only.

Changes:
- compact bookmaker label `.market-mini-badge`: 9px -> 8.1px (10% smaller), white text.
- compact detection lock `.api-candidate-mini`: green text, translucent green background, subtle green border.
- all devices; no feed, detector, market, prediction, ledger, runtime or engine logic changed.

Rollback:
1. Remove `<link rel="stylesheet" href="live-score-alert-visual.css?v=20260906-v1">` from `nomad-live-342/index.html`.
2. Delete `nomad-live-342/live-score-alert-visual.css`.

Baseline before link commit: `6f8896472dcf1085bc8c992f20aa81274eda7e77`.
Link commit: `39c4d7e0b4e9cd10943cc37b85f7d6b2e2c57a5f`.
