# Soccer Predictions Semi-Auto

This engine is isolated to `soccer-predictions/` and must not import, fetch, write, or depend on `/nomad-live/`, NOMAD Live Workers, TotalCorner, THScore, or 3.41 settings.

## Purpose

The human workflow stays unchanged: manually shortlist matches first. The engine only reduces the repetitive work after a match has been shortlisted.

Pipeline:

1. Human supplies approved Forebet match URLs.
2. `forebet_engine.py` fetches only those public match pages at a low rate.
3. The parser extracts factual match data only; it does not copy Forebet editorial analysis text.
4. The normalizer derives NOMAD card metrics and an initial 1X2 suggestion.
5. Output goes to `../data/staging-forebet.json` with `reviewStatus: "review"`.
6. A human reviews/overrides pick, odds, confidence and data quality.
7. `publish.py` publishes only records explicitly marked `reviewStatus: "approved"` into `../data/selected-matches.json`.
8. `predictions.json` remains the separate manual NOMAD Picks feed. This engine never promotes a match into NOMAD Predictions automatically.

## Safety rules

- No scheduled crawling.
- No discovery crawl: only URLs explicitly placed in the queue are fetched.
- No login, anti-bot bypass, CAPTCHA bypass, proxy rotation, or rate-limit evasion.
- Default delay is 4 seconds between pages.
- Missing fields stay missing. The engine must not fabricate stats.
- `publish.py` does not write `predictions.json`.
- Statistics therefore remain NOMAD-Picks-only.

## Files

- `queue.example.json` — input format.
- `forebet_engine.py` — collector + parser + normalizer + initial scorer.
- `publish.py` — approved staging -> Selected Matches only.
- `requirements.txt` — Python dependencies.

## Run

```bash
python -m pip install -r soccer-predictions/semi-auto/requirements.txt
python soccer-predictions/semi-auto/forebet_engine.py \
  --queue soccer-predictions/semi-auto/queue.json \
  --output soccer-predictions/data/staging-forebet.json
```

After manual review and changing individual records to `"reviewStatus": "approved"`:

```bash
python soccer-predictions/semi-auto/publish.py \
  --staging soccer-predictions/data/staging-forebet.json \
  --selected soccer-predictions/data/selected-matches.json
```

The public page reads `selected-matches.json`. NOMAD Picks continue to read `predictions.json`.
