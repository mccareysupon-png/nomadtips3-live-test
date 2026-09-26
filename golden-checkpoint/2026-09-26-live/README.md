# Ball46 Golden Checkpoint — 26 Sep 2026

Snapshot of the actual public production website at capture time.

**Safety:** Never use this branch as a blind whole-repository rollback. Compare against this snapshot and surgically restore only the broken production asset. Old branches/workflows may contain regressions.

Included: production index, every same-origin JS/CSS asset referenced by the index, and read-only board/signals/statistics snapshots. `manifest.txt` contains SHA-256 hashes.

Current horizontal scorebar is intentionally preserved. Its match cells are buttons and the click handler rerenders board/featured UI. Any future camouflage fix must preserve scorebar slot/grid geometry and must not touch API, odds, live feed, signal/referee logic, statistics, or routing.
