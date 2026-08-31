# OddStorm additional referee

OddStorm is an **additional, fail-open price referee** in front of the existing 5DollarFootballAPI / Bet365 live-AH adapter.

Selected referee bookmakers:

- Unibet
- Stake
- Pinnacle
- Ladbrokes
- BWin
- BetWay

Runtime rules:

- The existing 5DollarFootballAPI / Bet365 market remains the primary price input.
- OddStorm is queried only after the primary market is `AH READY`.
- OddStorm must map the same match and collect at least 3 selected bookmakers on the exact primary AH line before it can form a consensus.
- With at least 4 selected bookmakers, a primary Home or Away decimal-price deviation greater than 0.45 from the OddStorm median produces `REJECT`.
- Missing match, missing line, insufficient bookmakers, timeout, request budget, HTTP 403/429, or any OddStorm outage produces `SKIP` and the existing referee/price path continues unchanged.
- HTTP 403/429 opens a 10-minute OddStorm circuit breaker so the adapter does not repeatedly hit a blocked source.
- OddStorm live-index cache is 20 seconds and market-page cache is 25 seconds.
- OddStorm request budget is capped at 12 requests per rolling 60 seconds.
- No proxy rotation, CAPTCHA bypass, or anti-bot bypass is implemented.

Deployment entrypoint:

`src/index-oddstorm.js` wraps the existing `src/index.js`; the base adapter is not replaced or rewritten.
