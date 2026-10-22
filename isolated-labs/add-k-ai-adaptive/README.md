# ADD K AI ADAPTIVE V1 — SHADOW PROTOTYPE

Status: **ISOLATED TEST ONLY**. Not enabled, not scheduled, not connected to BALL46 live production, and not a trained AI.

## Decisions

- New condition ID: `ADD_K_AI_ADAPTIVE_V1`.
- Supports the normalized market families `AH`, `OU` (Over/Under), `1X2`, and `CORNERS`; no vendor integrations are included.
- First release is a transparent price-momentum **heuristic baseline**, NOT ML, self-learning AI, or a true profitability forecast. `score` is **not** a probability.
- It rejects stale, missing, unverified, mismatched-line or insufficient data. No sample/placeholder data enters production.
- It produces only `SHADOW_PICK` and `shadowOnly: true` records. No Cloudflare routes, cron triggers, production bindings, historic statistics, or actual markets are modified.
- `mergeLedger(existing, aiSignals)` merges identical underlying selections. `summarizeLedger()` returns `total` and `aiAdaptive` views; TOTAL is the unique union, AI is a filter over that union. A pick attributed to both existing and AI conditions appears **once in TOTAL**, not twice.
- Unique ledger identity uses a supplied canonical signal ID if present; otherwise match + market + selection + line + **exact lock timestamp**. Repeated analysis of one fixture at different lock times is therefore NOT silently merged. Unknown-schema historical records are retained. Production integration must supply stable canonical signal IDs and deterministic lock-time semantics, and verify late result updates.

## Input contract

The caller must normalize provider data and provide:

```json
{
  "matchId": "actual-provider-fixture-id",
  "market": "AH",
  "selection": "HOME",
  "line": -0.5,
  "sourceVerified": true,
  "momentum": 0.8,
  "observations": [
    { "at": 1792679580000, "odds": 2.05, "line": -0.5, "selection": "HOME" },
    { "at": 1792679940000, "odds": 1.90, "line": -0.5, "selection": "HOME" }
  ]
}
```

The timestamps are illustrations of schema only, NOT verified real football prices. For `1X2`, omit `line`. For `CORNERS`, a verified numeric total-corners line is required. Observations must represent the same market, line and selection. The live data adapter must justify how `momentum` is computed and document source timestamps and quality.

## Run tests

```sh
node --test isolated-labs/add-k-ai-adaptive/engine.test.mjs
```

## Before real deployment

1. Verify fresh, permitted, timestamped price feeds and corresponding match statistics for EACH market. The separate BALL46 Live preview currently has unverified odds access.
2. Make an adapter with explicit missing-data behaviour, immutable event/price history, and a provider-to-market mapping. Use a persistent store (e.g. Cloudflare D1) and a single auditable signal ledger.
3. Train/backtest on chronological data *without lookahead*, then conduct shadow/paper-run validation of false positives and stale-feed interruptions. Freeze and version model thresholds before promotion.
4. Wire new AI statistics as a filtered view of the existing canonical ledger; protect the existing TOTAL semantics and preserve all previously settled entries. Keep rollback and production deployment firewall.
5. Enable a scheduled Worker only after source permissions, isolation, accounting, load, and cost validation. No VPS is required for this small screening core.

Do not present shadow results, synthetic fixtures, or heuristic scores to members as live AI selections.
