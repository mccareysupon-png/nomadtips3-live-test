# Mobile Event Flow bars restoration — ready for review

Status: TEST ONLY. No Production version, deployment or traffic change was made.

Production source inspected: ball46-production e41be683-e67f-4023-9492-2b114203f0d7, deployment20efc3b9-6bd4-446b-9cb1-2a9a9ce526e2. Main SHA52c949aeb3145efd1fdc797314ae53d3dbea946405361cdbebe7d741a530e366.

Confirmed cause: the current mobile renderFlow branch delegates to the line renderer; the older bars helper still loads but is not called. The later dialog query also bypasses the old mobile-bar script entry. This audit identifies code behavior, not the identity of the person/chat that introduced it.

Prepared repair: prepend the existing mobile bar delegation and change one cache query token. Only index.js would change; all40othermodules and the existing bar component remain identical. Current desktop renderer and November5dialog code retained. No Engine, Signal calculation, API/polling, Member, billing, Ledger, Settlement, settings, services or Cron edit.

13 automated cases PASS: 2 real captured-Signal contract cases; current baseline mobile and PC/light/dark; candidate PC/light/dark; candidate mobile320/390/430 ×stored dark/light. Native existing theme behavior is recorded separately from requested theme. Signal sides/odds/entry minutes, pressure source data, 240px plot and 20percent lanes, detail access, section navigation, close/reopen, no overflow, no page errors, identical PC path geometry, zero provider requests and zero Production writes verified.

Successful workflow: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42714131580
Source/test commit: a604fca7cfe4aea6b0aae8a1b0f93230d4da84ce
Branch: codex/ball46-mobile-bars-restore-20261110

Local preview http://127.0.0.1:8830/ uses a clearly labelled recorded Production snapshot and the unchanged original bar component. CUA checked 320/390/430 widths, light/dark, and full captured-Signal details. Screenshots in qa/. The temporary responsive viewport was reset after review.

Review files: prepare.mjs, candidate/boundary-verified.json, qa/integration-verified.json, README.md. The actual source patch remains +295bytes in main; guard-only changes are reversible to the exact audited source.

Before a separately authorized rollout, re-query actual active version/config/assets/modules, rebase if changed, stage an immutable Worker preview, and verify all public bytes and native PC/mobile again. Rollback is the immediate version recorded during that rollout; e41be683 is only this task's currently audited baseline, not a timeless restore target. Preserve the new member image and API owner settings.

Test limitations: browser-only override with frozen real source data; unrelated vote/statistics/provider reads isolated. These checks do not certify upstream timing or live betting prices. Existing mobile mirror setup must be ready before opening the test fixture. This task does not modify that initial setup behavior.
