# Daily Snapshot rollout (STAGING ONLY)

Current Production stays on the existing member Worker. This branch is intentionally NOT deployed.

## Data architecture
- Publisher: member Worker's Cloudflare scheduled handler, invoked once per minute (requires `triggers.crons=["* * * * *"]`).
- Producer reads the already-public Ball46 Engine statistics (paginated) and board, then writes **one daily snapshot** to Cloudflare KV.
- Authenticated visitors read only `MEMBER_DAILY_SNAPSHOTS` KV, not Engine or 5USD.
- Board facts (score, events, basic stats) are included; the old minute-by-minute /history chart is deliberately unavailable in snapshot-only mode. Do not deploy until the UI fallback is approved/tested.
- KV stores keys `member:daily:v1:<BangkokNoonCycleStartMs>`; daily cycle starts at 12:00 Asia/Bangkok and records expire in 48 hours.
- Old cycle signals disappear from the member daily screen at noon without deletion from original Engine Ledger.
- On missing or stale daily KV, member endpoint fails closed HTTP 503; it does NOT fall back to source Engine.

## Cloudflare prerequisite
A Cloudflare KV namespace MUST be provisioned on the same account. Configure on `ball46-member/wrangler.jsonc` before deploy:
```json
"kv_namespaces": [{"binding":"MEMBER_DAILY_SNAPSHOTS","id":"<actual KV namespace ID>"}],
"triggers": {"crons":["* * * * *"]}
```
No namespace ID should be guessed. Verify Cloudflare cron deployment and first successful publisher write before routing existing paying members to this Worker. Do not disable the current production member route until verification.

## Mandatory release gates
1. Syntax check and unit tests (including noon cutoff and missing binding).
2. Dry-run deploy to a unique **staging** worker name, using a real separate KV binding.
3. Trigger publisher and verify same-cycle daily KV and member read response with access authorization; verify noon flip has no stale day leakage.
4. Compare signal count/results against Ball46 Main and check total upstream request counts.
5. Check session gates, 401 for unauthorized, authenticated read only, and UI on desktop/mobile (expanded history difference).
6. Keep a rollback handle to unchanged Production commit f87b240937e70cf0402e23808da814ccbb19f924.
7. Production deploy only after all gates pass. Avoid touching Engine, settlement, feeds, or Ledger.

## Known constraints
- Publisher still reads Engine output on schedule. It removes member-driven fanout, NOT producer load.
- 1-minute publisher may consume up to 30 statistics pages; benchmark production source load and adjust schedule.
- Cloudflare KV is eventually consistent; data may lag propagation.
- The publisher scheduled event errors until a valid KV binding is provisioned.
- Current Worker module still contains legacy helper `loadMatchDetail` but Member routes no longer invoke it in this branch.
