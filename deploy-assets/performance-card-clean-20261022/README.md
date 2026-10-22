# BALL46 Performance card presentation patch — 2026-10-22

Scope: desktop presentation of the existing `#ball46-daily-performance` component only.

- Preserves the existing DOM, API calls, London-day calculation, values, refresh loop and mobile behavior.
- Adds one immutable CSS asset and one optimized WebP visual.
- Stages from the exact active Cloudflare Production version at run time.
- Verifies Worker source, bindings, settings, schedules, backend revisions and all pre-existing asset modules before activation.
- Rolls back to the exact pre-deploy version if post-activation verification fails.
