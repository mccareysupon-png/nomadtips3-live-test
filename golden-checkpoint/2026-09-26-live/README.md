# Ball46 Golden Checkpoint — 26 Sep 2026

This folder is a snapshot of the **actual public production website**, not an assumption based on an older source branch.

Safety rule: **do not roll back the whole repository to this branch.** Use this checkpoint to compare files and surgically restore only the exact broken asset. Old branches/workflows may contain regressions.

The snapshot contains the production index, every same-origin JS/CSS asset referenced by that index, and read-only board/signals/statistics API snapshots. `manifest.txt` records SHA-256 hashes.

Horizontal scorebar note: the current production scorebar is intentionally preserved in this checkpoint. Its cells are buttons; click handling rerenders the board/featured area. Any later cosmetic fix should preserve the slot/grid geometry and avoid touching API/odds/feed/engine logic.
