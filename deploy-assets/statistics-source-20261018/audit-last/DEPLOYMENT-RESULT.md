# BALL46 Statistics settlement source

Deployment: **SUCCESS** on https://ball46.com/?view=statistics

Feature scope: **SOURCE1 live; SOURCE2 blocked by missing per-record provider provenance.**

- Only settled rows whose persisted settlementSource is DIRECT_FINAL_FALLBACK display SOURCE1. Actual5USD response -> validated fixtureId -> settlement result/final data -> stored marker -> archivalSignal -> Ledger V2 is verified in the current Engine export. Snapshot: 3594 confirmed rows across WIN/LOSS/PUSH/HALF_WIN/HALF_LOSS.
- EXTERNAL_FINAL_BRIDGE does not store sender identity, provider, or original response provenance. Its 988 rows must not be labeled SOURCE2/Gaoloo. Missing/other markers and PENDING/UNRESOLVED stay unlabeled.
- Files: index.html (scoped note CSS, Result-column room and cache key); singlepage-workspace-343.js (renderTable append-only note helper). Original badge markup/colors and statistics/data logic retained. Row heights match baseline; no new API or storage writes. Member and Engine unchanged.
- Commit: bd4e4d8bfc4ffb6e5f04d0ecfeb02314b3899157. Candidate run: 39126854716. Activation commit: 1203f9ef9d105bbe82aedf307daa7e4b30a14273; run: 39127081532. Both SUCCESS. Active version: c5094977-5f2c-4e4a-bb47-2196cfad4104, 100%; deployment: 585f1a4a-3c46-4e92-ad74-1c812b0428ee.
- Tests:18 passed. Candidate and Production:9/9 cases each, Desktop Light/Dark, mobile360/390/430 and1X2/AH/OU/Corners. Source text small gray, same line, not clipped. Public paths:82 HTTP200/intended hashes;5 read-only backend checks healthy. Protected settled fingerprints:8051; settings/bindings/Cron/domains/routes and Engine deployment unchanged.
- Rollback point: df6833ed-7214-472c-b532-c0e874b6a63b; guarded same-workflow restore with byte/health verification.

## SOURCE2 follow-up requirement

The settlement writer must persist the actual provider and trustworthy provenance for each result, including which inputs were consumed. The bridge currently saves only a generic path marker. That backend change and any historical backfill are outside this display-only authorization; neither was performed. Historical results must remain unlabeled where evidence cannot establish the provider.

[Registry](./deployment-registry.json) · [Source proof](./source-proof.json) · [Before Desktop](./before-desktop-light-result.png) · [After Desktop](./production-desktop-light-result.png) · [Before Mobile](./before-mobile-390-result.png) · [After Mobile](./production-mobile-390-result.png)
