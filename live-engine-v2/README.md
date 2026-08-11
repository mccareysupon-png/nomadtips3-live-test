# NOMADTIPS3 Live Engine V2

Status: FOUNDATION / PAPER DATA PIPELINE

## Goal

Build a single-source live football data pipeline that can later serve the public viewer, owner settings, notifications and PAPER execution lab without letting every page or subsystem call API-Football independently.

## Architecture

API-Football -> Single Collector -> Local Snapshot/Cache -> Condition Engine -> Cloudflare D1 -> Public Viewer / Owner Settings / PAPER Lab

Only the Collector owns `API_FOOTBALL_KEY`.

Frontend pages never call API-Football directly.

## Phase 1 behaviour

- Fetch `/fixtures?live=all` as the live heartbeat.
- Poll live fixtures every 15 seconds while matches are live.
- Slow down when no matches are live.
- Record the provider rate-limit headers from every response.
- Write an atomic local `snapshot.json` for downstream consumers.
- No odds or statistics fan-out yet.

## Planned Phase 2

- Apply local preliminary filtering first: status, minute, score and owner rules.
- Fetch statistics only for shortlisted fixtures.
- Refresh fixture statistics no faster than the upstream update cadence.
- Fetch in-play odds only when the active condition requires odds and candidates exist.
- Add D1 ingest and stored state for web display.

## Planned Phase 3

- Public read-only viewer.
- Owner-only settings page.
- Condition evaluation from cached snapshots.
- PAPER signal integration.

## Isolation

- Do not modify Production Car 1 selection files.
- Do not make browser traffic increase upstream API-Football calls.
- Keep real-money execution disabled.
- Keep the previous live engine available for rollback until V2 is verified, but do not run both upstream collectors at the same time during live testing.

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
