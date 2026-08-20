# CAR 3.42 worker boundary

This folder is intentionally separate from the CAR 3.42 web UI.

Planned data flow:

1. Scan TotalCorner Today for match id, teams, minute, score and cheap pre-screen fields.
2. Pre-screen matches before deeper requests.
3. Read TotalCorner live detail only for Watching/Near matches.
4. Read TotalCorner odds page only when a match is near the detector conditions.
5. Select Bet365 + In-play + Full-time + Asian Handicap.
6. Normalize all source data into `../shared/match-schema.json`.
7. Detector consumes normalized records only. Detector must never parse TotalCorner HTML directly.
8. Missing source values remain `null`; never coerce missing statistics to zero.
9. A signal requires fresh stats and fresh Bet365 odds.
10. Locked signal data is immutable after lock; later live odds must not overwrite it.

## Not implemented in this UI phase

- Remote scraping
- TotalCorner authentication/VIP access
- Live network polling
- Detector production rules
- Signal lock persistence
- Settlement
- Statistics persistence

The current `web/` page is a static UI prototype with mock records so layout and interaction can be approved before source integration.
