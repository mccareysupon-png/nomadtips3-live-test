# Shared team kits and flicker repair

Status: Production activated and verified on PC and mobile.

Scope: 22 realistic jersey colors (12 existing plus 10 approved new designs), identical deterministic fixture assignment across live match list, FEATURED MATCH and Who will win; retain shirt DOM nodes through score/clock/odds refreshes on PC and mobile.

Root causes:
- Native row refresh replaced all row contents, removing the injected jersey until a later animation frame.
- Mobile clock/score signature changes rebuilt the entire match list and then copied jerseys back on a later frame.
- Native rows selected CSS jerseys from team-name hashes; featured/prediction selected 12 raster jerseys from fixture hashes.

Repair:
- One 22-kit fixture mapping, with different color groups for home and away.
- Render complete jersey markup in native rows and mobile cards from the beginning.
- Preserve native team-cell and keyed mobile jersey node identities during refresh.
- Preload jersey images and decode replacement images before committing a new source; retain the prior decoded image on temporary loading failure.
- Preserve the existing Signals branch, prediction vote submission, eligibility, and percentages. No data, Member, billing, service bindings, backend logic, domains or schedules changes.

Local evidence: before repair, mobile 20 simulated UI refreshes / 80 observed frames produced 7 blank jersey frames and 9 jersey-node replacements. After repair, both PC and mobile 20 refreshes / 80 frames produced zero blank frames and zero node replacements. The simulation ran only in a local harness, which is excluded from deployment.

Four focused source/asset checks passed, including 2,000 fixture IDs, contrasting deterministic assignment, exact preservation of prediction behavior except image selection/handoff, and absence of localhost/test instrumentation in deployed assets.

Worker: ball46-production. Branch: codex/ball46-team-kits-stable-20261030.
Rollback baseline: 638ad4b5-1954-47e2-b2dc-043491926597.

Candidate version: a661c3ca-66fc-4f22-90e9-cf96a06ebbf0.
Candidate workflow: 40985611829, success. Validated 159 public paths, all six API health checks, expected Worker module/config preservation, and actual matching shirt images across PC/mobile list, featured and prediction views, with zero console errors.
Candidate source commit: e6f5956963389956b1c91fba204a3e799bb209f6.
Activation source commit: c17d612746bf632a6a1f540019579d0c2d39cf67.
An earlier candidate was rejected by the Cloudflare syntax validator for a duplicate wrapper name; it received no traffic. Wrapper names were isolated and runtime syntax is now checked before candidate upload.

Rollback plan: request phase=restore with base=638ad4b5-1954-47e2-b2dc-043491926597 and candidate=a661c3ca-66fc-4f22-90e9-cf96a06ebbf0. Runner requires the candidate to be active, verifies ownership/module hashes/config, and restores the baseline. Future rollback requires owner authorization; activation includes automatic rollback on failed post-deploy checks.

Activation workflow: 40985871802, success.
Active version: a661c3ca-66fc-4f22-90e9-cf96a06ebbf0 at 100%.
Deployment: a6271ef1-30b0-4394-bedb-dac6c9030a76.
Post-activation: both domains passed 159 path byte/status checks and six API checks; all 10,846 previously settled records preserved. Bindings, settings, dependent services, domains and schedules preserved.
Live browser: PC list/FEATURED/Who will win use identical image URLs; mobile list/FEATURED/Who will win use identical image URLs; no failed jersey images; no console errors. Screenshots recorded as team-kits-production-desktop.jpg, team-kits-production-mobile-list.jpg and team-kits-production-mobile-featured.jpg.

