# BALL46 V13 — Production deployment blocker (2026-10-23 ICT)

**STATUS: NOT DEPLOYED. READ ONLY/DIAGNOSTIC CANDIDATES.**
Production Worker: `ball46-production` active pinned version `578fd91b-424f-46c8-8f2b-b104f080cbc5` (Statistics old-UI first-paint guard V12).

## User task
Eliminate flickering/repeated DOM rebuilding on right-rail FEATURED MATCH (PC/mobile) and globe placeholders overlapping real flags. Preserve approved V12 presentation, Statistics first-render guard, live data, odds, API, Engine, HUB, Market, SEO, and mobile Event Flow.

## Proven evidence
- Predeploy PC browser QA: `.feature-facts` and `.feature-stats` child element removals 6–8 in 7.5s; country globe placeholders 27–30 visible despite real flags. Existing site still affected.
- `deploy-assets/featured-flicker-v13/feature-stable-patch.mjs` contains targeted stable renderer JS patch, and `hide-globe.css` masks only `.league-globe`. Neither was deployed.
- A freshly created V13 candidate version returns HTTP 500 Cloudflare 1101.
- Instrumented candidate error: `MATCH_PATCH_ANCHOR_DRIFT` in `__b46DarkMatchCard20261020` because HTML already has style `b46-dark-match-deep-graphite-teal-20261020`; skipping the guard exposes the same problem in the next interaction helper.
- **Differential control:** unchanged active version URL `https://578fd91b-ball46-production.mccarey-supon.workers.dev/` returns HTTP 200; a newly uploaded candidate with byte-for-byte SAME active Worker JS (sha256 `928776f81ed17e87ce5306111f58ec0a6a68e906465bf3ec2a1a1ee005690fce`) returns HTTP 500 (or 599 when wrapped for trace). Thus a V13 JS regression is NOT established: version upload/static asset inheritance is defective in this workflow.
- Both original active and cloned version metadata list 11 modules, compatibility_date 2026-09-09, bindings ASSETS/ENGINE/FULL_MARKET/HUB, static asset config `html_handling:none;not_found_handling:none;run_worker_first:true;base_path:/`.
- **Most important detail:** Pinned active version's `assets/index.html` **module** contains 194404 decoded characters and no style-marker, but on a new clone Candidate, `env.ASSETS.fetch('/index.html')` returns HTTP 200, **354817 characters** and ALREADY INCLUDES both `b46-dark-match-deep-graphite-teal-20261020` and `b46-statistics-no-old-flash-20261022`. `env.ASSETS.fetch('/')` returns 404 (html_handling none). Newly-uploaded Candidate appears to bind to **already-transformed HTML**, triggering second pass of old Worker transforms. Removing `assets.config` from metadata while retaining `keep_assets:true` did NOT fix it.
- Cloudflare Workers docs: `keep_assets` retains previously uploaded assets; it does not explicitly select deployed version assets. Validate full static-asset manifest/version attachment before deployment.

## Supporting runs
- Stats production V12 guarded deploy success: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39725674436
- V13 original failure: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39840305884
- V13 Candidate exception trace: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39841965628
- Identical Worker module failed control: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39844177928
- Clone exception + metadata compare: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39844382857
- Raw ASSETS.fetch('/index.html') evidence: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39844990864

## Safe next step
Find why a new version using `keep_assets:true` binds to 354817-char transformed HTML instead of 194404-char pristine index. Investigate isolated static-asset manifest/JWT attachment and whether concurrent candidate uploads affect `keep_assets`. First prove **byte-identical original Worker clone + correct asset binding** returns HTTP 200, then apply V13 patch and browser QA across desktop and mobile dark/light, ONLY THEN consider Production promotion with rollback.

## DANGER
This diagnostics branch intentionally contains generated Worker exception catcher and `assert.fail('DIAGNOSTIC_ONLY_NO_PRODUCTION_PROMOTION')`. NEVER DEPLOY THIS BRANCH DIRECTLY. Original V13 production workflow also fails candidate QA. Do not relax old anchor guards in Production, do not force deployment on untested candidate, do not modify API/Engine/HUB/Odds.
