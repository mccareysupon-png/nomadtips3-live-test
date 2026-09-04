# Marathon Engine

Isolated read-only live football collector and detector for Marathonbet.

## Scope

This engine is intentionally separate from CAR, Goaloo and Production. It does not place bets, fill stakes, submit wagers, or write back into existing engines.

Pipeline:

`MARATHON RAW -> capture -> parse without semantic change -> validate -> market/stat/event registry -> detector -> audit/API`

## Source-truth rules

- HOME and AWAY are never swapped.
- Handicap `+` / `-` signs are preserved exactly from source.
- `rawLine` and `rawOdds` are retained next to parsed numeric values.
- A nearby handicap line is never substituted for the source line.
- Missing or unverified fields are `SOURCE_UNMAPPED`; they are not guessed.
- Source event IDs are used only when actually found in the page/response. Otherwise the engine uses an explicitly internal key for local deduplication and marks `sourceIdVerified=false`.

## Collector

The collector opens Marathonbet Live Football in a persistent local Chrome/Chromium session and runs two read-only collection paths in parallel:

1. Rendered DOM scan for visible match/score/clock/market values.
2. Passive XHR/fetch/WebSocket capture for structured payload discovery.

No CAPTCHA bypass, credential extraction, cookie export, wager automation or anti-bot evasion is implemented.

## Verified public-page fields used by parser tests

The current public Marathon live page exposes football match names, live score/clock, Match Result, `To Win Match with Handicap`, handicap lines/odds and Total Goals. The parser tests use source-shaped samples and explicitly verify that `+1.0` remains `+1.0` and `-1.0` remains `-1.0`.

Statistics and incident/event payloads are collected raw when they appear in structured source responses. `/api/stats` and `/api/events` deliberately remain `mapped:false` until each Marathon field meaning is verified from a real live run. This prevents fabricated statistics/events.

## API

Local monitor: `http://127.0.0.1:8791/`

- `GET /api/health`
- `GET /api/live`
- `GET /api/matches`
- `GET /api/matches/:key`
- `GET /api/markets`
- `GET /api/signals`
- `GET /api/stats`
- `GET /api/events`
- `GET /api/raw/network`
- `GET /api/raw/websocket`
- `GET /api/raw/structured`

## Detector

Detector is OFF by default so no current CAR condition is invented or silently copied.

Configure with environment variables before starting:

- `DETECTOR_ENABLED=true`
- `MINUTE_MIN=60`
- `MINUTE_MAX=89`
- `MIN_ODDS=1.10`
- `MAX_ODDS=`
- `AH_MIN_LINE=1`
- `AH_MAX_LINE=`
- `SIDES=HOME,AWAY`
- `CONFIRM_SCANS=1`

Those numbers are only an example test profile. Set the actual desired rules explicitly.

## Run

Requires Node.js 20+ and Chrome/Chromium.

```bash
npm install
npm test
npm start
```

The browser collector refreshes its read-only scan at `POLL_MS` (default 2000 ms). It does not reload the page every two seconds; it reads the already-open live page and captures the site's own network updates.

## Test contract

Unit tests cover:

- exact handicap sign preservation
- exact HOME/AWAY orientation
- verified Marathon-shaped score/time/AH/odds parsing
- explicit failure on unmapped source text
- configured detector evaluation
- market odds history without changing handicap identity
- raw capture of unknown statistic/event objects

Live browser verification must still be run on a real Marathon session before statistics/events are declared mapped or production-ready.
