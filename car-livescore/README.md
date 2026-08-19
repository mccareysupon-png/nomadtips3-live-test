# CAR LiveScore

Standalone Scores & Results car for nomadtips3.

## Isolation contract

- Independent Cloudflare Worker: `nomadtips3-car-livescore`
- Independent web assets under `car-livescore/web/`
- Does not import or modify CAR 3.4 detector, settlement, history, odds or alert code
- Does not use Odds-API.io
- Not linked from the main CAR 3.4 navigation until explicitly approved

## Data flow

Goaloo public live index/detail feeds -> CAR LiveScore Worker -> short edge cache -> Live Scores / Results pages.

The browser only reads the CAR LiveScore Worker. It does not scrape Goaloo directly.

## Public preview

- Live Scores: `https://mccareysupon-png.github.io/nomadtips3-live-test/car-livescore/web/`
- Results: `https://mccareysupon-png.github.io/nomadtips3-live-test/car-livescore/web/results.html`
- Worker: `https://nomadtips3-car-livescore.mccarey-supon.workers.dev`

## Display

Expandable match rows show available possession, attacks, dangerous attacks, shots, shots on target, corners and card counts. The UI is responsive and uses an isolated dark nomadtips3 visual theme.
