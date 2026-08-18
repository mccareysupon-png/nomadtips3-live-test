# LM Studio CAR 3.5 -> 1xBet Price Watcher

Local Windows helper for reading CAR 3.5 live signals and opening the matching 1xBet event for manual review.

## What it does

1. Polls the CAR 3.5 `/live` feed.
2. Processes only rows whose decision contains `SIGNAL`.
3. Opens 1xBet in a dedicated persistent Chrome profile.
4. Searches for the target football match.
5. Uses LM Studio to verify the visible market / selection / line / current odds from page text.
6. Shows a small CAR 3.5 overlay on the 1xBet page.
7. Leaves the page open for manual amount entry and manual final confirmation.

## What it does not do

- Does not enter a stake.
- Does not click an odds selection for you.
- Does not click Place Bet / Confirm / Submit.
- Does not change CAR 3.5.

## First run on Windows

1. Install Python 3 and Google Chrome.
2. Open LM Studio.
3. Load one chat/instruct model.
4. Start LM Studio Local Server on port `1234`.
5. Run `setup.bat` once.
6. Run `start.bat`.
7. A dedicated Chrome window opens 1xBet. Log in manually there if needed. The session is kept in `.browser-profile` for later runs.

## Configuration

`config.json` is created automatically from `config.example.json`.

Important defaults:

- CAR 3.5 feed: `https://nomadtips3-car35-preview.mccarey-supon.workers.dev/live`
- LM Studio: `http://127.0.0.1:1234/v1`
- 1xBet start page: `https://1xbet.com/`
- Poll interval: 10 seconds

If your 1xBet account uses a regional 1xBet domain, change only `bookmaker_url` in `config.json` to the exact URL you normally use.

## Notes

The 1xBet DOM can change. The watcher intentionally uses generic search controls plus LM Studio text verification instead of hard-coding a transaction flow. If it cannot confidently identify a match or market, it stops at manual review rather than selecting anything.
