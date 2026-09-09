# NOMAD Live 3.43 — Clean UI

Isolated 3.43 interface. No 3.42 runtime dependency is intentionally imported.

Pages:
- `index.html` — Live Score / Condition Monitor
- `signal.html` — locked signals
- `statistics.html` — settled prediction ledger
- `settings.html` — owner-only direct URL, intentionally absent from public navigation

Current state: UI skeleton only. The next implementation layer is the independent 5USD HUB, followed by rolling calculations, market conditions, Bet365 price gate, signal ledger, and settlement.

Data rules reserved for the engine:
- Shots on Target / Shots off Target / Corners = rolling count deltas
- Attacks / Dangerous Attacks = rolling deltas converted to side share percentage
- Ball Possession = provider percentage
- Missing data remains null and is never converted to zero
