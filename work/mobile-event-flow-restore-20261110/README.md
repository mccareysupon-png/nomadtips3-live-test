# BALL46 mobile Event Flow bars — scoped restoration test

Preview: http://127.0.0.1:8830/
Test branch: codex/ball46-mobile-bars-restore-20261110
Production deployment: NOT performed for this task.

The current Production audit read Worker ball46-production version e41be683-e67f-4023-9492-2b114203f0d7, deployment 20efc3b9-6bd4-446b-9cb1-2a9a9ce526e2, with 41 modules. The live mobile page at an effective width390 rendered SVG lines and no b46-mobile-event-bars element, while the original bar component still loaded successfully.

## Confirmed cause

The current expanded-match script (query b46-eventflow-dialog-20261105b) routes mobile directly into renderMobileFlow, the line renderer. The older bar helper remains loaded, but its delegation guard is absent from this current script. The existing module's old expanded-match version is b46-mobile-event-flow-bars-20261102, while the live page points to the later dialog version. This identifies the conflicting renderer path; it does not establish which operator or chat introduced it.

## Patch boundary

Prepare changes only the current inline expanded-match source in index.js by inserting the existing bar delegation before the current mobile-line branch, plus one HTML cache query token. The November5 dialog fixes remain present. Main grows by295bytes. The other40modules, the original bar helper and assets, Member promotion, Engine/Signals, prices, Ledger, Settlement, billing, services, bindings, Cron and settings are not edited.

Expanded public source SHA before: d70ea9200ffc35eb14797627ab504a07186d2ca419339adb4ab50eb976ccf208
Expanded source SHA after: f8de607e4dd934765df6d97e1fac42040b49026e7e15645107c30e99ee4f36a8
Main SHA before: 52c949aeb3145efd1fdc797314ae53d3dbea946405361cdbebe7d741a530e366
Main SHA after: 477812a36eab7114c965a4863db7b35ea818414ae20bb3f49c316688b1084051
Original bar helper SHA unchanged: fb77ade6d094020a38cefbc296908a70c4c86f87f45ba422de4485f3f288d291

The public script contains an existing outer data-b46-flow annotation absent from the inline source. Prepare preserves this layer rather than embedding a duplicate annotation. Both source edits are mechanically reversible to the exact current main SHA.

## Preview and verification scope

The preview reuses the unchanged Production bar component and a real captured fixture/history/signal snapshot. It clearly labels the data as recorded, not current LIVE. The preview makes one local JSON read and no upstream request. Observed at320/390/430px:180bars,240px plot, no horizontal overflow; the saved Signal is accessible with its original side/line/odds/bookmaker/entry score. Light and dark component views were checked. The 20percent upper/lower lanes remain48px each.

The remote test workflow has no Cloudflare token and contains no Worker-version upload or traffic operation. It tests a browser-only override of the current expanded-match script, with deterministic recorded data. Unrelated vote/statistics/provider-backed reads are isolated. The HUB reader is adapted to the frozen fixture only for deterministic testing. Integration compares the Signal inputs actually used by the current public view; separate contract cases verify the complete captured Signal record. Thus these tests certify the rendering patch, not unrelated live backend health or executable odds.

Evidence: audit/current.json, candidate/boundary.json, qa/production-before-mobile.png, qa/preview-390-dark.png, qa/preview-390-light.png, qa/integration.json when successful.

## Before a separately approved Production rollout

Re-read actual Active Version and all module/config/asset hashes. If they differ from this audit, stop and rebase the same narrow guard onto the new authoritative source. Stage a Worker version without traffic, verify bytes and native PC/mobile behavior, then activate only with the owner's specific permission. Restore the immediate pre-deployment version if owned post-activation checks fail; never restore the entire old November2 source. Existing image and settings must remain intact.

Run local preview: node work/mobile-event-flow-restore-20261110/server.mjs
