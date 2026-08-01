# NOMADTIPS3 Live V2 Roadmap

## Status

Testing only. Do not deploy this feature to the main NOMADTIPS3 website until Live V2 is proven stable.

## Stability gate

Live V2 must pass all of the following before reuse:

- API-Football updates automatically from kickoff through HT, second half and FT.
- BigBalls updates automatically through a complete real match.
- Score, minute and status do not freeze during the match.
- HT is never misclassified as FT.
- Final score is persisted and locked after FT.
- Missing statistics or events are hidden rather than invented.
- The browser refreshes live data automatically without requiring manual page refresh.

## Phase after stability

Add a fourth menu to the main website:

**Selected Live Matches**

Purpose: show live tracking only for the six matches already selected by NOMAD SYSTEM / Manual Set 2.

### Page structure

- Keep `Today's 6 Picks` compact with Pick, locked Odds, Confidence and short status.
- Use a separate `Selected Live Matches` page for full live cards.
- Show up to six selected matches on one dedicated page.
- Mobile: one match card per row.
- Desktop: up to two columns where appropriate.
- Each card may show score, minute, status, latest event, timeline and available statistics.
- Do not mix large live cards into Stats or Share Poster pages.

## Provider rule

Match selection must happen first under NOMAD SYSTEM / Manual Set 2. API coverage must never decide which matches are selected.

After the six matches are locked:

1. Use BigBalls when that selected match is available.
2. Use API-Football as fallback.
3. If neither provider has reliable data, hide unavailable live fields and never invent values.

## Deployment rule

Do not modify the main NOMADTIPS3 site for this feature until both provider tests and FT persistence are confirmed stable.
