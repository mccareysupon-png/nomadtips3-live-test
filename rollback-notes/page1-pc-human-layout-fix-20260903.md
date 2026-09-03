# Page 1 PC human-readable card fix — rollback point — 2026-09-03

Scope: `nomad-live/index.html` Page 1, desktop/PC only (>=1025px).

User-approved repair intent:
- Do not touch Statistics, Live Score, Soccer Predictions, mobile, tablet, feed, engine, odds logic, or signal logic.
- HOME and AWAY must use the same visual order: shirt | team name | mirrored team score.
- Keep a single live time/status score block after the team area; do not show the central `1-1` score when team scores are already mirrored.
- Hide the redundant WATCHING/status meter only in the collapsed PC card. Do not remove detector state logic.

Pre-fix blob references:
- `nomad-live/index.html`: `7642baa0622555e7142ebdc6cbe72345113cd248`
- `nomad-live/collapsed-card-wide.css`: `ce55bf19ba603fac7826ffb1194b4322cd4ecdfb`
- `nomad-live/wide-team-stack.js`: `c5434bcb42728b862a5adcb3ef373872cace95be`

Rollback: restore the three blobs above. No engine/data rollback is required.
