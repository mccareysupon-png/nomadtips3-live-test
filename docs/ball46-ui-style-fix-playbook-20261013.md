# Ball46 UI Style Fix Playbook — 2026-10-13

Use this playbook for presentation-only fixes on Ball46 Production.

## Core rule

Start from the currently active Production version. Do not rebuild from an old branch or snapshot.

For any stubborn color, font, or component style:

1. Locate the actual runtime owner first (HTML/JS/CSS loaded by active Production).
2. Inspect the cascade/semantic layer before adding overrides.
3. If an old semantic rule owns the value, remove or neutralize that owner rule first.
4. Avoid stacking multiple `!important` overrides when the real owner can be fixed directly.
5. Keep Engine, Signal logic, API, Data, Settlement, Worker source, settings, bindings, and cron out of scope unless explicitly ordered.

## Static asset rule

If a same-path static asset is being served stale after a correct deploy, do not keep redeploying the same filename.

Use immutable versioned asset filenames instead:

- create a new JS/CSS filename,
- change only the index reference,
- keep the old asset untouched,
- verify the new file at the direct Worker origin,
- then verify the custom domain `ball46.com`.

This avoids Cloudflare static-asset path/cache ambiguity.

## Production verification

Before claiming success:

- confirm active Version ID,
- dry-run against the active Production rail,
- verify unrelated existing assets are unchanged,
- verify Worker source unchanged,
- verify settings/bindings unchanged,
- verify cron unchanged,
- verify the direct Worker origin,
- verify `ball46.com` itself.

## Current Featured Signal presentation decisions

- Away-team name: orange.
- Featured Signal typography: premium, clean, readable.
- Preferred font stack: `IBM Plex Sans`, `IBM Plex Sans Thai`, `Inter`, `Arial`, sans-serif.
- Featured facts labels: `HALF-TIME`, `CORNERS`, `CARDS H · A`, `ODDS AGE`.
- Card display uses full words, e.g. `1 Yellow / 1 Red · 1 Yellow / 0 Red`, not `1Y/1R · 1Y/0R`.
- Presentation changes must not change the underlying card counts or match data.
