# BALL46 Statistics Performance — TEST completion, 13 November 2026

**Status: TEST QA PASS, 78/78. Production NOT deployed, traffic NOT changed.**
Code commit: `049c266173a81bf1ecc792f0fc32e04acdd99907`.
Repository: `mccareysupon-png/nomadtips3-live-test`.
Branch: `test/ball46-statistics-content-revision-20261113`.
[Full successful run and artifacts](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43430173882).

## Verified baseline and workspace
- The supplied handoff at `fa8ac7b2884b2bc514e274abc81e6a7c7a82a1f7` was read completely.
- Shared TEST branch advanced during work. New work was preserved; this separate branch forked at `3e509c2406ff9e52a91e1362dc5e0efb51c6eb0d`. No force reset or blind replacement of newer work.
- Local working directory is not a Git checkout. Local files are a working mirror; GitHub commits use compare-and-swap ref updates and Actions checks out the exact commit.
- Production Website: `51f50aca-3e79-4d61-a536-f074ac338ace`, 42 modules, 7 bindings.
- Production Engine: `02e09215-02b1-47fb-b1cf-9423f50c7ce9`, 1 module, 4 bindings.
- Engine source SHA-256: `30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56`.
- Website main SHA-256: `b00db749dd43565ccf5cabca37dcd93ab2b8dae8fcb50f3209617154a722deb3`.
- Cloudflare control-plane reads verify active deployment identity and collect module hashes, binding names/types, configuration hash and Cron. This task sent no control-plane mutation.
- Production Ledger reads/writes, provider calls, security setting changes, Cron changes and traffic changes: **0**.

## Root causes and implemented corrections
1. `ledgerUpdatedAt` is a freshness timestamp. No-op sync advances it, so using it as content identity needlessly invalidates pagination and caches.
2. Rows and final metadata were separately visible during multi-chunk imports. Each changed 64-row chunk now commits rows, matching counters and one monotonic content revision in a short transaction.
3. A timestamp-pinned cursor with retries is not an immutable snapshot. Readers now pin a published, validated history generation in independent Summary storage. A later writer cannot change an already published page.
4. Website cache expiry previously caused a complete reread regardless of unchanged content. A small Summary revision check now reuses the same full browser snapshot without dispatching another full-snapshot event.
5. Re-parsing and re-serializing complete JSON chunks in Summary added initial-load cost. Complete chunks now pass through as their original JSON after SHA-256 verification. Only boundary chunks need parsing. Responses remain byte-bounded with complete continuation.
6. Cold source failures now share a five-second cooldown; there is no retry burst while no saved summary exists.

Freshness remains separate from identity. Same-millisecond changes, insert/update/delete, archive/restore, rollback and no-op behavior are tested. No formula, settlement rule or real Ledger row was changed.

## Files
All implementation and QA files are under `work/statistics-content-revision-20261113/`.
- Engine Statistics candidate: `content-revision.mjs`, `build-engine.mjs`.
- Summary/history: `prepare-summary.mjs`, generated `bounded-summary.mjs`, `snapshot-store.mjs`, `summary-service.mjs`.
- Existing Website integration: `ui-patch.mjs`; preserves current HTML/CSS, banners and financial chart asset.
- QA only, never deploy: `engine-harness.mjs`, `summary-harness.mjs`, `revision-test.mjs`, `snapshot-test.mjs`, `integration.mjs`, `browser.mjs`, `control-audit.mjs`.
- TEST workflow: `.github/workflows/ball46-statistics-content-revision-20261113.yml`.
Generated Engine candidates and QA evidence are workflow artifacts, not a Production upload.

## QA results
| Suite | Passed |
| --- | ---: |
| Atomic content revision | 12/12 |
| Immutable snapshots, bounded pages, streaming and corruption checks | 13/13 |
| Actual Engine + Summary Durable Objects | 13/13 |
| Current Website PC/mobile, dark/light, all eight market families | 40/40 |
| Total | **78/78** |

The recorded real Ledger contains **14,998 rows**. Every recorded settled ID, result, timestamp, market, selection, line, odds and score is compared, not just totals. Additional synthetic writes/settlement changes occur only in isolated test storage.

Validated scenarios include real writes while building/reading, unchanged imports while reading, duplicate/missing ID protection, stable old cursors, expiry/restart, storage budgets, exact streamed response parity, Unicode/escapes, corruption rejection before response publication, source failure, bounded retry under continuous writes, and recovery afterwards.

Continuous writes can prevent a new consistent generation from being built. After three bounded attempts, the service retains the last verified summary marked stale rather than publishing mixed rows. If no usable snapshot exists or its TTL expires, history fails closed instead of silently returning partial data.

## Measured speed
Both UIs use the **same actual isolated workerd Ledger**. The baseline calls the original Engine statistics response method, read-only, without scan/sync/provider work. Candidate uses actual Summary/history storage and streaming. Current production static assets and unchanged formulas are used on both sides.

Earlier results used an in-memory baseline against a storage-backed candidate. Those are superseded for the before/after comparison below.

| Profile | Baseline Statistics ready | Candidate ready | Faster | Warm no-op check |
| --- | ---: | ---: | ---: | ---: |
| pc-dark | 5.34 s | 3.96 s | 25.8% | 14 ms |
| pc-light | 5.51 s | 4.10 s | 25.4% | 14 ms |
| mobile-dark | 5.04 s | 4.24 s | 15.7% | 16 ms |
| mobile-light | 5.28 s | 4.19 s | 20.7% | 23 ms |

- First table appeared in approximately **2.84–3.12 s**; full Statistics/chart readiness was **3.96–4.24 s**.
- Homepage Summary ready: **0.25–0.45 s**, versus baseline **3.09–3.22 s**.
- First shared Summary materialization with no existing snapshot: **4.22 s**; this is distinct from a new visitor using an existing shared summary.
- Warm homepage summary reuse: under 1 ms in this run.
- No-op checks add **0 history requests**. History is not fetched when Statistics is unopened.
- Nine byte-bounded browser history pages in this fixture; source reduction uses at most 2,000 rows per source page.
- Browser heap observations: approximately 61–113 MiB across profiles. These are browser snapshots, not Durable Object peak-memory measurements.
- FCP/LCP/long-task observations are included in `qa/browser.json`. INP, physical mobile hardware, field network latency and hosted DO peak heap are not certified by this local workerd run.
- Measurements are one CI run per profile without network throttling; they are not a universal Production speed guarantee or a claim of 1–2 second full Statistics readiness.

## Scope preservation
No changes to Signal detection formulas, settlement formulas, Member/Stripe, vote behavior, score polling cadence, Event Flow, Favorites, current banner artwork or theme CSS. Engine source patching is assertion-guarded and inverse-checked; protected bytes are preserved. The current financial chart and market registry are hash-verified.

## Resource policy
Snapshot chunks are at most 96 KB and 100 rows; native reads use batches of at most 32 chunks. History pages stop at a conservative 6 MiB chunk-text budget and continue from the exact next offset. No complete Ledger array is held by the Summary service.

TEST defaults cap stored snapshot blobs at 128 MiB, retain at most 12 generations with a 120-second TTL, and reject more than 100,000 source rows rather than truncating data. Capacity must be checked against the current real dataset during any separately approved deployment. The original Ledger is not expired or pruned.

## Readiness, activation and rollback
**Development and local-runtime integration QA are complete. Ready for separate owner review/Production authorization. No Production deployment is performed by this report.**

After explicit approval:
1. Re-read actual active Website/Engine versions and configurations. If either changed from the verified base, reconcile the narrow patch against that new base before creating any upload.
2. Preserve every existing module, asset, route, binding, secret and Cron. Do not run an older combined-banner workflow.
3. Add the new internal Summary service on a distinct binding, for example `B46_STATISTICS_READ_V2`, after checking for a name collision. **Do not replace an existing Summary/media binding**: existing banner media may depend on it. No public mutation endpoints or provider bindings.
4. Stage and verify the actual hosted candidate and exact asset hashes; read-only warmup uses only bounded Engine cursors. Do not bootstrap by importing or editing Production Ledger.
5. Only then activate the explicitly approved release and verify live PC/mobile, source age, counts, assets and errors.

Rollback plan:
- Save the newly re-read version IDs/configuration/module hashes as the rollback restore point; the IDs above are the verified baseline for this test run, not a permanent latest-version assumption.
- Restore Website first, then the Engine version if this release changed it; verify the original binding/module/route/Cron hashes and source records.
- Retain independent Summary storage for evidence. Do not delete, restore or rewrite Ledger rows. The previous Engine can ignore the separate revision key.
- Verify real live UI/API and owner-visible source freshness after rollback before claiming recovery.
