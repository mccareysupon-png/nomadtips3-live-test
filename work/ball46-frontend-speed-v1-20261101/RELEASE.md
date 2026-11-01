# BALL46 frontend speed — verified Production release

Active version: 04e21962-c289-4adf-8ba6-8ebb49d06a62
Deployment: f7e55889-cbb3-4456-8771-e71e1d41e13b
Source commit: 3f93a1edaf25596cf9cb03731ec27cf601fbb534
Workflow: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41310069845

The approved patch was built from the verified current Production runtime. Existing modules and asset bundle were preserved; only the outer entrypoint was extended and one text module added for the changed workspace script.

Changes: share one date formatter, defer the hidden settled-days KPI boot until first Board paint, coalesce repeated loader checks, and version the changed script. Theme, monitor, Event Flow, engine/Signal formulas, score polling, Ledger/Settlement, Member/Stripe and bound services were not edited.

Verification: 71 Worker-owned public paths match expected bytes; six API/health checks passed on both domains; operational configuration, service versions and cron preserved; 11863 settled records retained protected fields. Source/runtime tests: 13. Controlled replay: 24 navigations.

Final live browser checks passed PC dark/light and 390px mobile dark. Monitor: three small rings. Event Flow: two rendered series. No page exceptions, console errors or failed requests in the final audit.

| CI browser | First visible matches | LIVE ready | Signals ready |
|---|---:|---:|---:|
| 1440px dark | 3.67s | 2.96s | 6.32s |
| 1440px light | 3.15s | 2.44s | 5.96s |
| 390px dark | 2.52s | 2.26s | 5.12s |

These are single live observations, not physical-device or field INP measurements. Controlled replay results remain the basis for before/after percentages; live payloads can vary. A universal 1–2 second guarantee is not established.

The first post-activation audit automatically restored the baseline after ERR_FAILED messages. Subsequent tracing identified three audit-blocked POSTs to /cdn-cgi/rum. Only the audit instrumentation was corrected; the same frontend patch was successfully activated. Production telemetry code was not changed. Provider-bound Full Odds requests were prevented only within the audit browser; that path was not exercised end-to-end.

Rollback version: 1f6499e3-6faf-408c-b47a-0b18d700b228. Restore only if the active version still belongs to this release, then verify previous public/module bytes, operational configuration, data and health. No data migration or global cache purge is needed. Old workspace version URLs continue to use the original runtime.
