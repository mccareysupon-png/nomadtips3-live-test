# NOMAD TIPS 3 — Car 3 Paper Bot Core

Car 3 is the bot-ready execution lane derived from the live detection system.

## v0.1 scope

This version is intentionally **paper-only**:

- receives a normalized live-football signal from the detector
- validates the signal
- creates a `WOULD_EXECUTE` paper order
- writes an append-only JSONL audit log
- performs **no website login**
- stores **no username/password**
- performs **no network requests**
- performs **no real wager or transaction**

## Flow

`Live Detector -> normalized signal -> Paper Runner -> WOULD_EXECUTE -> audit log`

## Signal contract

See `examples/signal.example.json`.

Required fields:

- `signal_id`
- `fixture_id`
- `created_at`
- `home`
- `away`
- `market`
- `selection`
- `target_odds`

Optional fields include `minute`, `score`, `confidence`, `reason`, and `source`.

## Run locally

```bash
cd car3-bot
node src/paper-runner.js examples/signal.example.json
```

The runner writes an audit record to `logs/paper-orders.jsonl` and prints the paper order to stdout.

## Safety boundary

Car 3 v0.1 stops at `WOULD_EXECUTE`. Any future connector to a third-party website must be separately reviewed against that service's current rules and permissions before implementation.
