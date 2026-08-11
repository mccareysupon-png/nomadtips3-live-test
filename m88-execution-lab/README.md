# M88 Execution Lab

Status: **PAPER ONLY**  
Real transaction: **DISABLED**

This project is an isolated execution lab for NOMADTIPS3 Live Soccer Scan V2.
It consumes normalized football signals, simulates an execution lifecycle, stores an audit trail, and produces results for the owner dashboard without logging in to M88 or placing real-money bets.

## Architecture

API-Football -> VPS Collector -> Central Cache/D1 -> Condition Engine -> Signal -> M88 Execution Lab (PAPER) -> Dashboard

## Goals

- Receive normalized signals from Live Scanner V2.
- Validate fixture, market, selection, odds, freshness and deduplication.
- Simulate ACCEPTED / WAITING_ODDS / REJECTED / DUPLICATE / PAPER_PLACED states.
- Persist an auditable SQLite ledger.
- Remain isolated from Production Car 1 and from any real-money execution.
- Keep a future adapter boundary so a human-confirmed execution integration can be developed separately without changing the scanner.

## Safety Boundary

The following are intentionally not implemented in this lab:

- M88 username/password storage
- automatic M88 login
- browser credential injection
- automatic bet placement
- deposits/withdrawals
- any real-money transaction

## Signal Contract

Required fields:

- `signal_id`
- `fixture_id`
- `created_at`
- `home`
- `away`
- `market`
- `selection`

Optional fields:

- `minute`
- `score`
- `target_odds`
- `confidence`
- `reason`
- `source`

Unknown markets or selections fail closed. Missing odds enter `WAITING_ODDS`.

## Local run

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
python paper_executor.py --signal sample_signal.json
```

Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python paper_executor.py --signal sample_signal.json
```

## Next integration

When Live Scanner V2 is ready, connect its normalized signal output to this lab. The lab must continue to run in PAPER mode until explicit manual confirmation is designed and tested separately.
