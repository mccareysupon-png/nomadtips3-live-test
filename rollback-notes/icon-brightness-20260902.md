# UI brightness rollback note — 2026-09-02

Scope approved by user:
- Brighten default vintage toolbar icons on Page 1 (Signal).
- Brighten default odds-format icons on Page 2 (Statistics).
- Brighten vintage team-shirt icons on NOMAD Live 3.41 only.
- Do NOT modify any Page 3 / `nomad-live-342` team-shirt files, CSS, JS, DOM, feed, or engine logic.

Rollback targets before this change:
- `nomad-live/toolbar-vintage-independent-icons.css`
- `nomad-live/statistics-odds-icons.css`
- `nomad-live/team-shirts-pc.css`
- `nomad-live/mobile-team-card.css`

This change is presentation-only. No live feed, odds calculation, filter, signal, match parsing, statistics logic, or engine code is in scope.
