# NOMAD 3.43 Ultra Full Market

Isolated 5DollarFootball Ultra odds sidecar for the expanded FULL MARKET card.

- Fixed bookmaker order: Bet365, Pinnacle, Crown, 1xBet, 12Bet, Interwetten, Macau Slot, 18Bet, VCBet, Easybets.
- One provider request fetches all 10 requested bookmakers for a fixture.
- 15-second per-fixture cache with stale fallback.
- Account plan guard: 40 requests/minute; this sidecar soft-limits itself to 24/minute to leave headroom for the existing 3.43 engine and HUB.
- Existing Bet365 Signal/referee path is not changed by this worker.
