# Mobile theme preference — verified Production release

Date: 2026-11-10. Worker: ball46-production.

- Active version: bd44b666-b6ad-4bd8-b13e-53bc74c65077 (100%). Deployment: d5980824-fbe5-4235-b803-75633b1dcb41.
- Source branch: codex/ball46-favorites-test-20261110. Release commit: 619f8abca37b63e8c93afa7ae610c618ea935993. This branch name does not mean Favorites was included.
- Successful run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42820046247
- Immediate rollback: c9e86292-6ed9-4788-98de-1b363f478d74; baseline deployment ef0efc15-3b9b-4df5-aa7f-cec95d87df92. Re-read actual active version before any rollback; do not overwrite a later owner's deployment.

Only one existing mobile HTML payload literal in the current main module changed. No new module, import, fetch wrapper or API route was added. Other 41 modules remain byte-identical. Original public asset bodies and references are retained; only the intended inline mobile controller/style changes on root/index HTML are expected. Assets/bindings/secrets/configuration/Cron/routes/service versions were preserved.

Verification: 12 isolated configurations previously passed. Real Worker Preview and public Production each passed PC1366/mobile390 dark/light, current model-score matching, existing 5s cached reader, drawer theme control and computed mobile light Statistics header colors. 53 public paths checked on Preview and both Production domains. Existing 14348 settled-record fingerprints preserved; total ledger rows at verification 14627. Engine/HUB health OK. Browser tests suppress unrelated vote/Statistics/provider reads; real health and paginated protected-record verification were independent checks, not synthetic data assertions.

Manual Production inspection confirmed real live fixtures and a functioning dark/light toggle at 390px, with no errors in the inspected browser log. Screenshot: release-audit/production-mobile-light.jpg.

Owner Bulk setting stayed 10 seconds. Effective runtime was 10 seconds before/after activation, and 30 seconds in the final health sample. No interval settings or service code were written; this observation is recorded without attributing its cause to this UI patch.

Excluded: Favorites activation, Website board-recovery candidate, Statistics cursor-only candidate, Engine/Signal formulas, ledger/settlement changes, Member and Stripe. Existing Engine memory failure is not claimed resolved. The 15-minute pre-deploy existing-log query returned no memory-limit events; that is a bounded observation, not a guarantee of future absence.

