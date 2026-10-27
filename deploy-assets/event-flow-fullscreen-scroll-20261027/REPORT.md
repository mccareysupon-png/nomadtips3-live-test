# Event Flow fullscreen external scrollbar fix —27Oct2026

Status: VERIFIED PRODUCTION. Version d484be51-6e78-47b4-a410-077a0aaa0fad100%; deployment a3400047-8dd3-4555-b119-91c58b69ca39,27Oct2026 19:07:32ICT.
Guarded activation https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40501152983 SUCCESS. Both ball46.com and www.ball46.com:114public paths each match expected hashes;6APIs each pass.10230preexisting SETTLED fingerprints preserved.24modules retained,23non-main byte-identical. Bindings/settings/assets/schedules/domains/routes/bound-service versions unchanged. HTML SHA256 f823362c5177c1ca3b6048016c0e12a945acd2888e959162433cc86f7b7b9840.

Repository mccareysupon-png/nomadtips3-live-test; branch codex/ball46-event-flow-fullscreen-scroll-20261027; Worker ball46-production.
Baseline/rollback18b01d9d-a2a4-4932-8d56-5ecb3678488e, deployment9883af06-6eaa-4f3b-bd4e-7b922df4707c.

Cause verified in actual Production DOM: fullscreen Event Flow z-index2147483000 is nested in .board-sections stacking context z-index1. External sidebar native-scroll track is a separate body child at z-index20. Hit testing at x236,y38 returns .b46-sidebar-outside-scroll while fullscreen, matching the owner's screenshot.

Fix: one desktop media-query CSS rule. While an .expand-flow-card.b46-eventflow-viewport-expanded exists, .b46-sidebar-outside-scroll has visibility:hidden and pointer-events:none. The existing element/scroll state remains; normal state automatically restores when the fullscreen class disappears. No JavaScript or data changes. CSS applies only at min-width768px.

Only homepage / and /index.html presentation is extended. Original24modules, all public assets, bindings/settings/assets/cron/domains/routes/services, APIs and data retained. Original Event Flow lanes/gradients/fullscreen sizing, Sidebar normal layout, Vote, jerseys, Signal, Statistics, Member and engines retained.

Source commit38bec04d7cda7e52d447d4677137d0a137fcf511. Source and HTML baseline hashes asserted before patch; candidate syntax passes. Screenshot before-light.png saved locally in outputs/event-flow-fullscreen-scroll-20261027/.

Candidate d484be51-6e78-47b4-a410-077a0aaa0fad; Actions40500538028 SUCCESS. Current active baseline/config checked before upload; public path and6API checks passed. Browser PC Dark/Light: fullscreen visibility hidden,pointer-events none; hit test returns expand-card-head at the old external scrollbar coordinate. Collapsing by existing toggle restores visibility visible. Existing Esc clears crosshair; fullscreen keyboard behavior was not changed. Mobile390 uses original native layout,externalTracks0. Console errors0. Activation commit3bc9c2b2ef121d561dd537f3a30af7b68f630c03.

Previous approved Event Flow report/source/rollback history: https://github.com/mccareysupon-png/nomadtips3-live-test/blob/44bd1740948ee001224006f2c0d390177da6b910/deploy-assets/event-flow-lanes-20261027/REPORT.md

Guarded rollback: restore baseline only while owned candidate is active and config/route/module guards match; preserve data. No stale main or Preview source used.

Actual Production post-deploy browser: new style marker present; real FC Real Bengaluru/Roots FC graph. Dark and Light fullscreen: track visibility hidden,pointer-events none; hit at old scrollbar coordinate is expand-card-head. Collapse restores visibility visible. Console errors0. Screenshots production-fullscreen-dark.png and production-fullscreen-light.png saved under outputs/event-flow-fullscreen-scroll-20261027/.
