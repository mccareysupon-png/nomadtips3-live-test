# Car 3 — Standalone PAPER Scanner

Isolated Football In-Play scanner for NOMADTIPS3 **Car 3**.

## Safety boundary
- PAPER TEST only.
- Standalone process only.
- Does not connect to NOMADTIPS3 Production, Production Scheduler, or any real-money bot.
- Uses in-memory SQLite for alert deduplication; state resets when the process stops.
- Reads the API key only from the `API_FOOTBALL_KEY` environment variable. Never commit the real key.

## Install
```bash
python -m pip install -r requirements.txt
```

## Unit tests
```bash
python scanner.py --test
```

## Run PAPER scanner
PowerShell:
```powershell
$env:API_FOOTBALL_KEY="YOUR_REAL_KEY"
python scanner.py
```

CMD:
```cmd
set API_FOOTBALL_KEY=YOUR_REAL_KEY
python scanner.py
```

## Current safeguards
- 6 requests/second safety cap
- 360 requests/minute safety cap
- Circuit breaker CLOSED / OPEN / HALF_OPEN
- Adaptive polling: 25s normal / 15s near-condition / 60s degraded
- Bulk live fixtures + bulk live odds
- Targeted statistics only after time/odds filters
- Fresh/stale/expired statistics cache
- One statistics fetch per fixture even when evaluating Home and Away
- Live market ID bootstrapped from `/odds/live/bets`
- HTTP 204 treated as a valid empty response
- 429 / 5xx bounded retry + backoff

## PAPER criteria in this revision
These are **test criteria only**, not NOMADTIPS3 Production rules:
- Minute 60–80
- Minimum 1X2 odds 1.50
- Rule A (optional compatibility): Dangerous Attacks >= 50
- Rule B core: Shots on Goal >= 3, Total Shots >= 8, Corners >= 4, Possession >= 55%

Do not treat these PAPER criteria as Production betting rules.
