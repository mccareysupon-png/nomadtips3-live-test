# BALL46 static-cache patch — Production verified 10 Nov 2026

Worker: ball46-production. Active version: c9e86292-6ed9-4788-98de-1b363f478d74 at 100%. Deployment: a95eaab0-e72b-4beb-bf25-3dde5ece3555.

Source: codex/ball46-static-speed-20261110, release commit 1174a6eb4b458fb500eaf9c7df13c54ce804369f. Successful activation and verification: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42774419123.

Only the outer static-cache wrapper and content-hash references changed: index.js plus new static-speed-cache-20261110.mjs. The other 40 original modules, every original public asset body, ASSETS configuration, bindings, inherited secrets, routes/domains, schedules and bound-service versions were preserved. The unrelated mobile chart patch was not bundled.

Verified 97 public paths on Preview and both Production domains; 44 addressed JS/CSS responses are byte-identical and immutable. Main HTML and APIs retain existing no-store behavior. The original 5-second screen reader remains unchanged. Owner-configured Bulk interval remains 10 seconds. The existing runtime reported a temporary 30-second effective fallback during one post-activation sample, returning to 10 seconds in the final check; no HUB configuration or code was changed.

Real Worker Preview and Production browser cases: PC1366/mobile390, dark/light, four cases each, all passed in final run. Real displayed score matched the current fixture model. No page errors, failed resources, direct provider attempts or site-setting writes in these scoped tests. Provider-backed odds/history and unrelated vote/statistics UI reads were isolated; Engine/HUB health and protected Statistics records were checked independently. Existing 14,322 settled record fingerprints were preserved; current settled count 14,338. Initial lab tests also passed 19 contracts and 8 browser comparisons. No Production cold-load percentage gain is claimed.

The first activation was rolled back automatically after a board HTTP599 during verification (run42720731422); root cause remains unconfirmed. Read-only recovery audit42774075344 then returned HTTP200 on8/8 Production/Preview board reads with identical bodies, confirmed original source/configuration and preserved settled records. A single unchanged-candidate retry retained every strict error gate and passed all final checks. Do not interpret this release as fixing or proving the absence of intermittent backend599 errors.

Guarded rollback: restore immediately preceding version e41be683-e67f-4023-9492-2b114203f0d7 only while this owned candidate remains current and configuration is unchanged. Immediately before successful retry, that baseline was active via rollback deployment6411439e-35e4-405c-b7a9-91e2b102ce1c. No global purge or old source redeploy is required.

Manual final browser verification on ball46.com showed the real2-0 score and44 addressed assets. Screenshot: release-audit/production-manual-verified.png. No background monitoring was scheduled.