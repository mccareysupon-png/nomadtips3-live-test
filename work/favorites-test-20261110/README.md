# BALL46 Favorites — TEST ONLY

Interactive preview: http://127.0.0.1:8835/?favorites=1

Branch: codex/ball46-favorites-test-20261110. No Worker version uploaded, Production traffic switch, merge, binding/configuration change or database write.

## Approved behavior

- One icon-only star before the two-team pair, vertically centered. No visible label beside it. A selected star is yellow; the invisible accessible label and pressed state update immediately.
- Favorites menu after All matches in the desktop sidebar and mobile navigation drawer. Saved fixture IDs are stored under the dedicated versioned localStorage key ball46_favorites_v1. No member/account integration or cross-device synchronization is introduced.
- Filtering reads the same complete fixture collection already held by the dashboard, before existing group pagination. Finished fixtures remain saved. Saved IDs are not automatically deleted when outside the provider's current feed.
- Existing route state is extended by favorites=1. Refresh and browser back/forward restore the filter. History restores status locally rather than generating a delayed synthetic click and an extra history entry.
- On the existing live workspace, entering Favorites changes only the local filter and route. Star toggles outside Favorites retain row nodes. Native mobile star nodes survive score-card reconciliation. Actual navigation away clears only the active Favorites view, preserving saved IDs.
- Keyboard Enter/Space works, and clicking the star does not activate match details. Mobile uses sibling star/card buttons, not nested buttons.

## Verified source and boundary

Read-only source capture42776417562 identified active ball46-production version c9e86292-6ed9-4788-98de-1b363f478d74 / deployment a95eaab0-e72b-4beb-bf25-3dde5ece3555, 42 modules. Public source headers/hashes and one existing cache-only HUB snapshot/signals response were captured. No upstream force-refresh request was used.

prepare.mjs creates a browser-only overlay: patched dashboard display/filter hooks, workspace route hooks and native mobile markup/heading reconciliation, plus favorites.js and favorites.css. Original source files remain in fresh/. All generated inline scripts are syntax-checked. It does not generate or upload a Production Worker candidate. Existing Engine/Signals/odds/Ledger/Settlement/Member/Stripe and original polling/fetch functions remain unchanged.

## Test evidence

Successful run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42779758410

Four complete browser cases passed: PC1366 and mobile390, each dark/light. Checks cover star toggle, local Favorites navigation, refresh persistence, back/forward, cached score changes, removal of the last favorite, empty state, keyboard use, non-nested buttons and page overflow. Source-attributed fetch instrumentation reported no requests initiated by Favorites code; existing independent refresh timers were retained. Direct provider calls and Production writes were zero. QA JSON and screenshots are attached to that run.

The automatic tests use the complete recorded snapshot (1,786 fixtures). The user-facing local preview uses a small selection of recorded fixtures for visual review. Data is explicitly recorded, not current LIVE. Test score changes are local fixture simulations only. Unrelated Statistics/vote/provider-backed reads are isolated; this is not certification of those backend systems. Browser storage is local to the browser/origin; unavailable/blocked storage cannot provide persistence and does not write to a server.

## Running or reviewing

Local preview is running on127.0.0.1:8835. Rebuild: node work/favorites-test-20261110/prepare.mjs. Start: node work/favorites-test-20261110/server.mjs. PC/mobile screenshots: qa/preview-pc.png and qa/preview-mobile.png.

No Production release is authorized by this test task. Before a later approved release, re-read the active Worker/module/public-source hashes, rebase the same changes if the source differs, preserve current static-cache URL/hash behavior, and verify an actual Worker Preview with unchanged bindings/assets/configuration and rollback to its immediate baseline.