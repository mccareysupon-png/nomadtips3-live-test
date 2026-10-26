# BALL46 Sidebar Rounded Deep Green V2 — VERIFIED Production

Approved preview: Rounded 20px desktop sidebar, darker green gradient #172c20 → #102219 → #0b1912. Light: white/off-white gradient. Existing icons, fonts, numbers and geometry retained. Scope is @media(min-width:761px), only aside.left-rail[data-b46-sidebar="1"]. Stronger selector prevents existing runtime-injected sidebar CSS from overriding the approved palette. No new browser JavaScript.

Production Worker: ball46-production. Version 61e444b7-86af-4125-a652-717a4b74572c at100%; deployment 9180f960-838d-4fba-a1aa-8e13f3f06dfc. Activated26Oct2026 12:25:40ICT. Both https://ball46.com and https://www.ball46.com independently returned exact expected HTML dc86c7c9c78dc313a726ae3da004a9f839703b9014cbb28252ce8b12dcba932a.

Repository mccareysupon-png/nomadtips3-live-test, branch codex/ball46-sidebar-rounded-20261026. Shipped source ea32b898b94da00ba83061cc71547186b0ec1c6c; activation117564aaa2e286ed2eb240e827ff3e97a2755da2.

Changed files: build/sidebar.css (812bytes); build/patch.mjs and build/manifest.json. Deployment helper run.mjs/cutover.mjs/request.json/provenance.json/browser-proof.json, workflow .github/workflows/ball46-sidebar-rounded-20261026.yml. Only homepage HTML changes publicly. All24original modules retained,23non-main modules byte-identical. No API, Engine343, Signal, Statistics, Member, Vote,12shirts,Featured or Last5 implementation changes.

Validation: Node syntax and exact HTML minus one CSS block equals baseline. Candidate PC1366 Dark/Light, Laptop1024, mobile390/360: no horizontal overflow, width210px,row34px,y188/222/256 unchanged; native mobile sidebar remains display:none,radius0,background none. Production PC Dark/Light and mobile390 independently verified. Browser console errors0. Current snapshots under outputs/sidebar-rounded-deploy-20261026/ (before-light.png,candidate-dark.png,candidate-light.png,candidate-mobile.png,production-dark.png,production-light.png,production-mobile.png).

Actions [candidate40273859885](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40273859885) and [activation40274068665](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40274068665) SUCCESS.114public paths/domain and6existing health APIs/domain pass. All10049preexisting SETTLED row fingerprints retained. Settings,7bindings,assets config,schedules,domains,routes and bound-service versions unchanged.

Rollback: immediate baseline15607595-5930-4093-8e9e-e64c52d9f120/deployment942790e4-50c4-480d-9459-cfa725464451. Guarded restore only if current version is this owned candidate and config still matches recorded baseline. Keep all votes/history/ledger data. Previous staged unactivated6a0a0e96 is superseded; do not deploy it. Do not use older branch snapshots.
