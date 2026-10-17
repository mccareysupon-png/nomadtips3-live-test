# BALL46 multi-source results — development execution on 2026-10-17

## User instruction
Preserve the existing **5USD primary live engine, every market rule, in-play odds, signal generation, locked selections, WIN/LOSS/Units/Statistics and Member**. For football final scores only, accept qualifying FT evidence from 5USD, Goaloo, and future certified providers, with first verified result winning and one authoritative atomic PENDING-to-SETTLED transition by original Engine v5.

## Completed in this session
- An isolated staging integration kit was built locally, packaged as `BALL46_MULTI_SOURCE_INTEGRATION_STAGE_V2_20261017.zip` (delivered in the conversation, **not deployed**).
- Added source normalizers: official 5USD `finished`+`full` score evidence, and Goaloo explicit `-1` FT parser with timezone certification gate.
- Added 5USD historical API client with HTTP 429 `Retry-After` cooldown instead of hammering shared API quota.
- Added a mandatory **original native grading callback** seam guarded by simulated transaction and immutable existing locked odds, lines and picks; does not implement replacement betting algorithms.
- All 54 local Node.js tests pass (0 fail), including staging fake Durable Object concurrency. This is **not equivalent** to Cloudflare or Engine343 native settlement runtime testing.
- Live read-only Goaloo time audit: [Actions 39042993254](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39042993254). 37 tentative home/away name matches with current Hub; 35 show 0-minute kickoff offset, 2 show -5/-8 minutes. League labels disagree often; NONE automatically mapped or settled. A timezone/league certificate still requires operational review.
- Historical 5USD identity recovery audit: [Actions 39042615115](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39042615115). 24 identified missing Hub PENDING fixtures queried via the official authenticated per-fixture API; all returned HTTP 429. Stop retries until quota/backoff allows; **zero identities verified** from this run.
- Earlier production read-only audit: [Actions 39039638149](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39039638149), identifies active Engine v5 code/version and missing historical metadata. Code fingerprint audit [Actions 39039854184](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39039854184).
- The existing GitHub branch unit suite for pure result router and registry remains 41/41 passing. The new ZIP code has not been pushed to Github because its storage-write file was rejected by the connector security gate in a preceding attempt. Do not claim it is remotely integrated.

## Still blocking **complete** delivery
1. Source ownership and exact canonical active Engine v5 settlement writer are **not** yet wired to the staging module. An old `workers/nomadtips3-343-auto-engine/src/index.js` is not the currently active Worker. No guessing/overwrite.
2. Staging runtime has not been installed in an isolated Cloudflare Durable Object and cannot establish the real database's atomic settlement semantics.
3. No live independent Goaloo result has yet passed full persistent ID+league+kickoff verification for an old PENDING signal, although feeds and independent kickoff candidates were read.
4. Historical 5USD fixture recovery is blocked on actual API quota (HTTP 429) and source availability.
5. Goaloo use rights and source time normalization must be certified for intended commercial deployment.
6. Production deployment requires rollback evidence, full parity checks and explicit release authorization. **No production deployment, signals changed, P/L recalculation or database writes occurred.**

**Status: development staging progressed, not production-complete.** Continue only with the exact active Engine source and isolated verification; keep every existing betting rule untouched.
