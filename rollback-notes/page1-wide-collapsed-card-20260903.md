# Page 1 wide collapsed-card rollback — 2026-09-03

Scope: Page 1 / `nomad-live/index.html` presentation layer for collapsed match cards on tablet + desktop only (>=521px).

Approved direction:
- preserve mobile <=520px exactly as-is
- stack HOME/AWAY vertically with shirt + team name + mirrored team score
- keep the real live score node intact and visible in the central status block
- arrange the collapsed card into MATCH / STATUS / DETECTOR / MARKET zones where space allows
- keep the current detector and price data; do not rebuild market logic in this phase
- do not change `runtime.js`, engine, feed, polling, match schema, score parsing source, signal logic, odds logic, or expanded-detail data

Pre-change rollback references:
- `nomad-live/index.html` blob SHA: `15b899376d4f2998f237681f55491f2f2288ba13`
- `nomad-live/team-shirts-pc.js` blob SHA: `c21e3a475468396b5b84aedf17b9557683ec0526` (reference only; not planned for modification)
- `nomad-live/team-shirts-pc.css` blob SHA: `315f31fd03096ef890ad16dbf762ac3c2bdf8144` (reference only; not planned for modification)
- `nomad-live/collapsed-card-wide.css`: did not exist before this change
- `nomad-live/wide-team-stack.js`: did not exist before this change

Rollback procedure:
1. Restore `nomad-live/index.html` to blob `15b899376d4f2998f237681f55491f2f2288ba13`.
2. Delete `nomad-live/collapsed-card-wide.css`.
3. Delete `nomad-live/wide-team-stack.js`.
4. No engine/data rollback is required because this change is presentation-only.
