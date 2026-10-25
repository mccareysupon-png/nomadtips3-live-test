# Flashscore source migration checkpoints

The replacement source must be validated end-to-end before production cutover:

- Livescore / daily feed: match ID, team IDs, minute, status, score.
- Match summary / events.
- Match statistics.
- H2H.
- Lineups and player match statistics.
- Standings: overall, home, away, form where available.
- Team / squad pages or structured data keyed by team ID.
- Odds are reference-only until latency is measured; do not use as immutable lock source yet.

Cutover rule: remove the previous source URLs/parser/fallbacks from this engine once Flashscore core live layers are proven. Detector, runtime Settings, settlement, locked signal history, and public UI remain unchanged.
