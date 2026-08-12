# NOMADTIPS3 Live Engine V2\n\nStatus: VPS CAR 3 ENGINE / PAPER ONLY
\n## Goal\n\nBuild a single-source live football data pipeline that can later serve the public viewer, owner settings, notifications and PAPER execution lab without letting every page or subsystem call API-Football independently.\n\n## Architecture\n\nAPI-Football -> Single Collector -> Local Snapshot/Cache -> Condition Engine -> Cloudflare D1 -> Public Viewer / Owner Settings / PAPER Lab\n\nOnly the Collector owns `API_FOOTBALL_KEY`.\n\nFrontend pages never call API-Football directly.\n\n## Runtime behaviour
\n- Fetch `/fixtures?live=all` as the live heartbeat.\n- Poll live fixtures every 15 seconds while matches are live.\n- Slow down when no matches are live.\n- Record the provider rate-limit headers from every response.\n- Write an atomic local `snapshot.json` for downstream consumers.\n- Apply local preliminary filtering before statistics and odds requests.
- Fetch statistics in groups of 20 and one shared live-odds snapshot.
- Reuse the original Car 3 weights, momentum smoothing, market parser,
  red-card safety and confirmation-round rules.
- Persist state and signal history in local SQLite using WAL mode.
- Write normalized signals to the existing Car 3 PAPER bot inbox.
- Publish stored state to Cloudflare D1 for the Access-protected owner page.
- Back off automatically on API-Football 429 responses and resume without a
  manual restart.
- Run continuously under systemd.
- Preserve candidate history in D1 with first/last seen time, minute range,
  peak momentum, streak, decision state and the entry statistics snapshot.
- Recheck pending PAPER signals through the same VPS API collector every five
  minutes and settle them as WIN, LOSS, PUSH or VOID without enabling any real
  transaction connector.
- Expose 7/30/90-day PAPER analytics on the Access-protected owner page,
  including net units, ROI, accuracy, daily signal volume and cumulative units.

## Signal policy

The VPS engine is intentionally `UNLIMITED`: there is no daily ten-signal gate.
It still deduplicates each `fixture_id:selected_side` so a match cannot emit the
same side twice.

Execution remains `PAPER_ONLY` / `WOULD_EXECUTE`; no real transaction connector
is enabled.
\n## Isolation\n\n- Do not modify Production Car 1 selection files.\n- Do not make browser traffic increase upstream API-Football calls.\n- Keep real-money execution disabled.\n- Keep the previous live engine available for rollback until V2 is verified, but do not run both upstream collectors at the same time during live testing.\n\n## Required secrets

Only the VPS environment file contains `API_FOOTBALL_KEY` and
`V2_INGEST_SECRET`. Neither value belongs in Git or browser code.

## Local run
\n```bash\npython -m venv .venv\n.venv\Scripts\activate\npip install -r requirements.txt\ncopy .env.example .env\npython collector.py\n```\n\nLinux/VPS:\n\n```bash\npython3 -m venv .venv\nsource .venv/bin/activate\npip install -r requirements.txt\ncp .env.example .env\npython collector.py\n```\n