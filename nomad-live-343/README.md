# NOMAD Live 3.43

Isolated 3.43 runtime. It does not import the 3.42 runtime.

Pages:
- `index.html` — today board / live match analytics / Bet365 market data
- `signal.html` — active live signals only
- `statistics.html` — settled prediction ledger
- `settings.html` — direct settings URL for the 18-market engine

Runtime flow:
`5DollarFootballAPI -> 5USD HUB -> rolling evidence -> Bet365 full-odds referee -> immutable signal entry -> live mirror -> settlement -> statistics`

Data rules:
- Shots on Target / Shots off Target / Corners use rolling count deltas for evidence.
- Attacks / Dangerous Attacks use rolling deltas converted to side-share percentages for evidence.
- Possession uses the provider percentage.
- Missing data stays unavailable; it must not be converted to zero.
- Raw provider market lines are preserved separately from any selected-side derived line.
- `unknown` provider status is unconfirmed and must never be auto-settled as finished.

Settlement rules are centralized in `workers/nomadtips3-engine-343/src/market-core.js` and are regression-tested across every registered market before deployment.
