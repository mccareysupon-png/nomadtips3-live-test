# BALL46 visual suite release

Status: Production verified on PC and mobile. Activation workflow 40980004961 completed successfully.

Approved scope: Statistics artwork for Total, 1X2, AH, O/U, BTTS, Corners, Cards and Other; full round ball and balanced card insets; live match detail event icons; mobile Summary -> Event Flow -> Stats -> Markets navigation and content order.

Worker: ball46-production. Domains: ball46.com and www.ball46.com.
Source repository: mccareysupon-png/nomadtips3-live-test.
Branch: codex/ball46-visual-suite-20261030.
Rollback: 19ec3fcc-b206-4ead-b620-90cd4d5fcb99.

Preserve: Member, real subscriptions, billing, NOMAD/backend logic, Signals rendering, bindings, settings, service Workers, schedules, domains, historical settlement fields.

The stale 404 script reference color-semantics-stat-entry-20261011.js is removed; existing functioning scripts remain byte-identical.

Local verification: three boundary checks pass; eight market images map correctly; twelve live event markers retained; replacement icons measure 20x20 pixels on mobile; mobile content DOM and visual order match the four menu items; console has no errors.

Deployment gates: read-only backend health; baseline module hashes; candidate exact assets and module/config preservation; browser PC/mobile evidence; settled-record comparison; both-domain public file checks. Automatic rollback to baseline if post-activation validation fails.

Candidate: 638ad4b5-1954-47e2-b2dc-043491926597.
Candidate source commit: 2bc5d18ca2fb4f908c81b4af262d5a5cdd073b93.
Candidate workflow: 40979675778, success.
Candidate checks: 135 public paths, six healthy APIs, unchanged bindings/settings/schedules/domains/service versions. All eight market images verified in browser; light and dark theme checked; mobile 14 market cards preserved; twelve event markers render as 20x20 icons on PC and mobile; four navigation targets work; zero console errors.
Activation commit: 5ea95066142698aad82f7fe4ee9f4b371f3042a1.
Activation workflow: 40980004961.

Active version: 638ad4b5-1954-47e2-b2dc-043491926597 at 100%.
Deployment: 75c79bfa-516e-4479-908f-02ed57aedd82.
Both domains passed 135 path byte/status checks and six API health checks. All 10,838 previously settled records retained their protected fields. Bindings, schedules, domains, settings and dependent service Worker versions were preserved.

Final live browser checks: all eight Statistics market images map to the selected market; mobile Corners artwork loads; live mobile match details display Summary, Event Flow, Stats and Markets in matching DOM and visual order; 12 event icons measure 20x20 pixels; 14 bookmaker market cards remain present; no browser console errors.

Screenshots: visual-suite-production-desktop.jpg, visual-suite-production-statistics-mobile.jpg, visual-suite-production-match-mobile.jpg, visual-suite-production-eventflow-mobile.jpg.

Rollback procedure: retain this source/asset manifest and update only request.json to phase=restore, base=19ec3fcc-b206-4ead-b620-90cd4d5fcb99, candidate=638ad4b5-1954-47e2-b2dc-043491926597. The runner requires the candidate to be the currently active version and checks its exact modules/config before switching traffic back. Emergency rollback is built into the activation runner and was not needed. Owner approval is required for any future rollback action.

