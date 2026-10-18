# BALL46 compact match-header search

Status: **SUCCESS**, verified directly on https://ball46.com

- Compact search sits in the first match-status header, before the count. Desktop208px; mobile145px. Header height remains46px Desktop/40px mobile. Placeholder: Team or league; accessible label: Search matches by team or league.
- Reuses original data-search input, existing input listener and unchanged visibleRows team/league filter. Clear restores rows. Empty results retain the search and zero count. Continuous typing preserves focus/caret through header rerenders. Existing Deep Teal proxy uses the same query and retains its own focus.
- Current base is 7c7c8db2-baed-4d09-82ce-73842a42e8b7, not the earlier Deep Teal version. Latest compact mobile brand/hidden heading and all5 inline script blocks are preserved.82 current assets including ball46-footer.css were fetched fresh and checked against the immutable Active version. No extra API/data/engine/Member changes.
- Production files: index.html (scoped CSS and script cache key); dashboard-v2-stage3-featured-facts-20261013a.js (search control placement, focus/clear handling and IME guard). Other80 assets and Worker main unchanged.
- Source commit: 4676e6225d174d0f500c3dc9e0025785f687bb4e; candidate run: 39133775436. Activation commit: fd8a076e5891de4b886f11d30afa80f6c2eb2730; run: 39134268695. Both SUCCESS. Active version: 45f78a15-986e-47e1-b33d-ec202a55e0e1,100%; deployment: 9f89e6cf-23c9-4d4a-a197-d431af3511fd.
- Tests:18 passed. Candidate/Production:10/10 functional cases each: Desktop Light/Dark/1024, mobile360/390/430, Deep Teal popup proxy, navigation recovery, All Matches and Signal. No duplicate original input, horizontal overflow, heading/count overlap, or console errors.
- Public paths:83 HTTP200/intended hashes;5 read-only backend checks healthy. Protected settled fingerprints:8059. Settings/bindings/Cron/domains/routes unchanged.
- Rollback point: 7c7c8db2-baed-4d09-82ce-73842a42e8b7; guarded same-workflow restore retains the immediately preceding mobile compact-brand work.

[Registry](./deployment-registry.json) · [Before Desktop](./before-desktop-light.png) · [After Desktop](./production-desktop-light.png) · [Before Mobile](./before-mobile-390.png) · [After Mobile](./production-mobile-390.png) · [Search result](./production-search-result.png)
