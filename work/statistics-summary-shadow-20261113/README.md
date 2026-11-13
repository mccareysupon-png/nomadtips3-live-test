# Statistics summary — isolated shadow implementation

Status: not deployed; not connected to Production storage or UI. This branch is
test-only. It inherits the recorded Production-source capture, NOT a claim that
the repository's runtime tree is the current deployed Website.

## Implemented

`summary.mjs` is an independent transactional projection of changed Ledger rows.
It retains compact previous contributions rather than whole match payloads.
It subtracts old contributions before adding replacements. Duplicates do not
write; conflicting replay and older revisions fail. Deletion retains a revision
tombstone. Restart recovery uses storage, not process memory.

Counters, priced stake, net units, ROI, odds sums/counts and raw-market buckets
are calculated once. Created-day buckets use London 06:00 and settlement-day
buckets use Bangkok midnight. Summary reads touch two keys, regardless of Ledger
length. Backfill consumes pages <=500. Storage writes are only in the isolated
shadow namespace and bounded by affected cells, not all history.

The count reference is extracted from hash-verified Engine functions. Financial
reference tests extract the existing longterm-performance settlement function.
Fresh-source CI reads current Cloudflare versions and asset payloads using GET
only; the external base financial reference is matched by exact hash and byte
length against the ACTIVE main module's manifest. This is not a public-URL
delivery test. An Engine hash drift or ambiguous mapping stops the job. No Engine route,
provider endpoint, scan, Cron, traffic or configuration is changed.

`ordered-blocks.mjs` composes bounded chronological blocks for net, stake, ROI,
peak, maximum drawdown and best recovery. Corrections rebuild the affected block
and merge summaries rather than reducing daily net and losing intra-day peaks.
Eight further tests compare the existing financial function on generated rows,
including 15,000-row composition, corrections and order/generation rejection.

`test-ledger-adapter.mjs` connects the recorded Engine writer to ISOLATED TEST
STORAGE. Source-row writes/deletes, a persistent monotonic source clock, compact
fingerprints and shadow deltas commit together. Identical totals with changing
live score mirrors do not trigger another projection write. Eight writer
contract tests exercise insert/settlement/correction, failure/retry,
deletion/restore and changed-key rejection using actual recorded writer methods.
This adapter is explicitly NOT installed in Production and is not a production
migration/backfill mechanism.

## Required before real use — not yet implemented

Update 12:25 Bangkok: one strictly read-only real Ledger audit passed, 14,998
rows in 30 bounded pages, 32 runtime GETs including before/after Ledger metadata.
Nonempty-cursor routes were verified against actual inherited Engine handlers
to skip scan/sync/provider calls. Full global counts, raw-market settled counts,
financial net/stake and weighted win rate matched in one stable generation.
Audit run: 43371896543. No retries, Production writes or added provider calls.

The captured minimal Ledger is reused for consumer tests; future test runs do
not repeat the live audit unless deliberately marked with [ledger-audit-once].
`summary-reader.mjs` provides a small read-only TEST_PREVIEW contract and fails
closed by default. `lazy-client.mjs` coalesces summary reads, fetches history only
on explicit opening, cancels closed details and retains marked-stale last-good
totals on error. These contracts are not installed into Website routes or UI.
History server queries/indexes are still required; client tests use fixture pages.

1. Verify the test-storage adapter in Cloudflare runtime, then review an Engine
   integration candidate. Current Production Ledger does NOT supply the new
   monotonic revision contract. Never invent revisions from timestamps. No hook
   is installed in Engine, and no existing Ledger rows are modified.
2. Bootstrap a stable generation and capture concurrent writes without gaps;
   reconcile before publishing. Existing `meta.updatedAt` changes on sync even
   without row changes, so it is not alone a suitable durable change sequence.
   A paged full scan on each browser visit is not the final design.
3. Global counts/raw markets/net/stake were matched against a stable real Ledger.
   Still verify daily buckets and ongoing aliases/repairs/deletions during
   realtime catch-up. Snapshot parity alone is NOT Production readiness.
4. Preserve homepage's existing half-result/day semantics. Its old card counts
   half-wins as a win while statistics uses half credit. Do not silently unify.
5. Ordered chart metrics (daily OHLC, maximum drawdown, peak and recovery) cannot
   be derived from daily net alone. The bounded composition is implemented;
   still connect actual chronological indexes/tie order, day OHLC boundaries and
   block invalidation after date changes. No chart change here.
6. Add a read-only summary contract with source revision and freshness. Keep the
   last verified snapshot on failure, marked stale; never present partial/zero
   data as complete. Then adapt homepage/market totals to that small response.
7. History is fetched only on opening Statistics, via cursor/filter queries over
   the complete Ledger. Opening one page must not limit search or totals to it.
   This requires an indexed/filter contract, not a cap on the old endpoint.
8. Run Cloudflare-runtime, real-data parity, PC/mobile, score/signal preservation
   and memory-reset observation before requesting Production activation.

## Isolation / rollback

There is no deploy configuration or public mutation route here. Rollback now is
simply not connecting this module; Production remains unchanged. Any later
activation must re-read the Website and Engine active versions, retain all
modules/bindings and use a tested flag to revert consumers to the last verified
snapshot. Do not weaken backend health checks to activate it.

## Verification

`node work/statistics-summary-shadow-20261113/test.mjs`

Results are written to `qa/results.json`. Mock storage tests are not a live heap
measurement, real-data parity, or proof that all Engine resets are fixed.

Architecture reference: Cloudflare recommends durable persistence and atomic
read/modify/write transactions across async storage operations:
https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
