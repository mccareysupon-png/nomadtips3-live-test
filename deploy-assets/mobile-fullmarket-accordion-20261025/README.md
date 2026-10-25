# BALL46 — Mobile Full Market accordion

**Status: source prepared and syntax checked. Not deployed.** Never infer Production activation from this branch.

## Production source of truth
- BALL46 Production Registry: Issue #366.
- Repository: `mccareysupon-png/nomadtips3-live-test`.
- Worker: `ball46-production`; domains `ball46.com`, `www.ball46.com`.
- Baseline at start: `15607595-5930-4093-8e9e-e64c52d9f120`, deployed 25 Oct 2026 at 06:47 ICT, including verified Last5 and Vote V9.
- The `ball46-live` repository is a separate preview project and must not be used.

## Scope
- **Mobile only** at viewport width <=760px.
- Each Full Market market card can independently expand/collapse; default collapsed.
- When collapsed, its label and actual LIVE prices remain visible (or CLOSE/OPEN only when LIVE is absent, with accurate stage).
- Only one expanded market per fixture; state retained between DOM refreshes when possible.
- Uses existing rendered DOM data; tapping does not make an additional request.
- Existing bookmaker selector and all OPEN/CLOSE/LIVE rows remain unchanged.
- No PC UI, Engine343, signal, settlement, statistics, membership, Vote, Last5, cache, or upstream API changes.
- Preserves existing Worker modules and bindings via a hash-guarded additive wrapper **if a separate candidate deployment is later authorized and passes QA**.

## Implementation files
- `mobile-accordion.js`: mobile progressive-enhancement behavior + scoped borderless graphite CSS.
- `patch.mjs`: checks exact Production main-module SHA, then appends one browser-asset route and one script tag without changing backend routes.
- `patch.test.mjs`: syntax, no-browser-fetch, guard and wrapper checks.
- `audit.mjs`: read-only audit collector for publicly served UI resources.
- `.github/workflows/ball46-mobile-fullmarket-accordion-20261025.yml`: read-only public UI inventory, no production writes.

## Checks done
- Browser JS compiled using V8: PASS.
- Generated Worker JS compiled using V8: PASS.
- Browser asset contains no fetch/XHR/sendBeacon: PASS.
- No Production release or Cloudflare version change performed.

## Release gate: required before deployment
1. Compare latest active Cloudflare Worker with Issue #366; stop if version differs.
2. Obtain actual served Full Market DOM and verify selectors match every shown market and bookmaker, on 360px and 390px native mobile. Current screenshot is not enough to prove this.
3. Run live candidate Preview: collapse/expand, rapid bookmaker switching, card refresh, fixture change, scrolling and keyboard; confirm zero additional API requests per toggle.
4. Check desktop 1024/1440 Light/Dark unchanged, Last5 and Vote unchanged, no console errors, and protected assets/Worker bindings identical.
5. Release only via version-guarded candidate activation; verify both production domains; rollback to the immediate previous active version only if the candidate is still the active version.

Do not deploy from old main or any retired full-market workflow. Never restore a pre-V9 version over the current Last5 source.
