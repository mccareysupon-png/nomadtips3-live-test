# Prediction3 2D Live Pitch — 2026-09-05

Scope: presentation-only 2D live-match visualization for Prediction3.

Changed / added:
- `prediction3/index.html`
- `prediction3/live-pitch.css`
- `prediction3/live-pitch.js`

Behavior:
- 2D football pitch rendered with CSS/HTML.
- Animated ball uses percentage coordinates.
- Event pins support attack, dangerous attack, shot, goal, corner, yellow/red card, VAR and substitution.
- Momentum zones and compact possession/attack display included.
- Demo animation is explicitly labelled `VISUAL DEMO · DATA FEED NOT CONNECTED`.
- No live provider, prediction engine, scheduler, settlement logic or existing Prediction3 ledger logic changed.
- Engine-ready public API: `window.NOMAD_P3_PITCH.setSnapshot(snapshot)`.

Rollback:
1. Restore `prediction3/index.html` to the commit immediately before `e978675a3c6b7337ca02fabe3aa8db0a1e16fc74`.
2. Delete `prediction3/live-pitch.css`.
3. Delete `prediction3/live-pitch.js`.

Creation commits:
- CSS: `6e1d4a21739ec5b9bf6932cda0c6e2ce8bf9e7b0`
- JS: `a841e0d67e6089d5b5fd93e3ab769f994b85ca83`
- Mount in Prediction3: `e978675a3c6b7337ca02fabe3aa8db0a1e16fc74`
