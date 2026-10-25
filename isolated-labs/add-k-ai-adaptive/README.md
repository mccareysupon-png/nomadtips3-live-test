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


## V2 shadow machine-learning module (not production)

- `adaptive-model.mjs` adds a small per-market supervised logistic model. It can be trained using **only already-settled** historical WIN/LOSS decisions with verified price observations available at each original lock time.
- A chronological validation window begins only after training results were settled. If there is too little data, only one class, no leakage-safe holdout, or no improvement over the historical baseline Brier score, it returns `ready: false`; inference then returns `NO_PICK`.
- Each market has its own model; AH, OU, 1X2 and CORNERS are not pooled into one performance estimate. Models are **not** trained by page loads; Cloudflare Worker/D1 training schedules and persistence are future work.
- The model is an experimental statistical classifier, not a pretrained conversational model. Its `score` is **not calibrated**, should not be presented as a promised winning probability, and has no established live edge. Predicting on existing data does not retrain weights by itself.
- This prototype does not yet implement an automated five-minute observation runner, a one-to-two-hour retraining process, a production database, odds ingestion, or actual signal posting.
- Synthetic test fixtures are used **only** for logic tests; no synthetic fixtures or scores appear on the public site.
- `predictShadow()` passes the observed last price and model version to `createShadowSignal()`; all such records remain `shadowOnly: true`.
- Ledger IDs include a lock timestamp. Existing historical records with incomplete structure remain present rather than disappearing.

Run the complete tests with Node 22+:

```sh
node --test isolated-labs/add-k-ai-adaptive/engine.test.mjs isolated-labs/add-k-ai-adaptive/adaptive-model.test.mjs
```

Do not merge into `main` or deploy until source verification, exact production record mapping, safety review and real-data chronological tests are complete.


## V3 read-only adapter for legacy AH match feed (isolated test only)

- `legacy-ah-adapter.mjs` accepts the CURRENT `nomad-live-engine` `/feed` match shape (fields `id`, `freshness`, `rolling.recent`, `selectedPrice`, `priceSources`). This is a source-code contract, not a claim that live source data is currently available.
- Requires a known-match ID, `freshness.sourceStale === false`, available rolling pressure metrics, and `PASS` selected AH quotes whose source ID, bookmaker, side, line, odds and source update timestamp match one existing `priceSources` snapshot. Missing or stale values produce `NO_PICK` prerequisites; no values are invented.
- `appendLegacyAhQuote()` is a PURE function that appends a verified observation to the caller-supplied array, ignoring repeated polls of the same source timestamp. It **does not persist** quotes to Cloudflare, D1 or the public statistics ledger.
- `buildLegacyAhCandidate()` requires at least two actual distinct source timestamps for the same fixture/selection/line/bookmaker/source, with at least one minute between first and last. It rejects conflicting price histories, changed source or line, and attempts to reconstruct missing history from a single current quote.
- This bridge currently covers `AH` only. `OU`, `1X2` and `CORNERS` remain supported by the isolated analysis engine **only when** a future provider-specific adapter proves the required actual odds/time/settlement contract for each market. Do not label them source-connected today.
- `rolling.recent.homePressure` and `awayPressure` are preexisting weighted match-pressure values. Their normalized difference is a *heuristic directional feature*, not verified probability or odds-derived money flow.
- The existing live Worker retains only the current market snapshot in `state.matches`; the match's rolling history concerns match statistics, not a durable market-price ledger. A future collector must persist immutable, provider-attributed, timestamped price changes **before** this can be used with real history.
- Production `/statistics`, TOTAL and all condition settings have NOT been changed. All code remains in the isolated branch and draft PR.

Tests:
```sh
node --test isolated-labs/add-k-ai-adaptive/*.test.mjs
```

Test fixture values are synthetic, tests are offline, and no Cloudflare deployment or live-provider permissions are claimed.
