# NOMADTIPS3 Live Engine V2

Status: VPS CAR 3 ENGINE / PAPER ONLY

## Goal

Build a single-source live football data pipeline that can later serve the public viewer, owner settings, notifications and PAPER execution lab without letting every page or subsystem call API-Football independently.

## Architecture

API-Football -> Single Collector -> Local Snapshot/Cache -> Condition Engine -> Cloudflare D1 -> Public Viewer / Owner Settings / PAPER Lab

Only the Collector owns `API_FOOTBALL_KEY`.

Frontend pages never call API-Football directly.

## Runtime behaviour

- Fetch `/fixtures?live=all` as the live heartbeat.
- Poll live fixtures every 15 seconds while matches are live.
- Slow down when no matches are live.
- Record the provider rate-limit headers from every response.
- Write an atomic local `snapshot.json` for downstream consumers.
- Apply local preliminary filtering before statistics and odds requests.
- Fetch statistics in groups of 20 and one shared live-odds snapshot.
- Reuse the original Car 3 weights, momentum smoothing, market parser,
  red-card safety and confirmation-round rules.
- Persist state and signal history in local SQLite using WAL mode.
- Write normalized signals to the existing Car 3 PAPER bot inbox.
- Publish stored state to Cloudflare D1 for the Access-protected owner page.
- Back off automatically on API-Football 429 responses and resume without a
  manual restart.
- Run continuously under systemd.

## Signal policy

The VPS engine is intentionally `UNLIMITED`: there is no daily ten-signal gate.
It still deduplicates each `fixture_id:selected_side` so a match cannot emit the
same side twice.

Execution remains `PAPER_ONLY` / `WOULD_EXECUTE`; no real transaction connector
is enabled.

## Isolation

- Do not modify Production Car 1 selection files.
- Do not make browser traffic increase upstream API-Football calls.
- Keep real-money execution disabled.
- Keep the previous live engine available for rollback until V2 is verified, but do not run both upstream collectors at the same time during live testing.

## Required secrets

Only the VPS environment file contains `API_FOOTBALL_KEY` and
`V2_INGEST_SECRET`. Neither value belongs in Git or browser code.

## Local run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python collector.py
```

Linux/VPS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python collector.py
```
