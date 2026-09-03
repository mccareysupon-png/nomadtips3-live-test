# Page 1 live score presentation rollback — 2026-09-03

Scope: Page 1 / `nomad-live/index.html` match-card live score presentation only.

User-approved change:
- remove the visible `LIVE` label, green dot, and separator from the score status line
- keep the phase text (`1ST HALF` / `2ND HALF`)
- center phase, score and minute cleanly with balanced vertical spacing on all device sizes
- preserve the existing mobile team-row score mirror layout
- do not change live data, minute parsing, score logic, engine, API, polling, market logic, or match-card data schema

Pre-change rollback references:
- `nomad-live/live-score-status.js` blob SHA: `eb838fdf45efddea84fc07af09a18a165e6453b6`
- `nomad-live/index.html` blob SHA: `6e95f7ca447aa605850aa935835ae36180a7fafd`

Rollback procedure:
1. Restore `nomad-live/live-score-status.js` to blob `eb838fdf45efddea84fc07af09a18a165e6453b6`.
2. Restore `nomad-live/index.html` to blob `6e95f7ca447aa605850aa935835ae36180a7fafd`.
3. No engine or data rollback is required because this change is display-only.
