# BALL46 desktop league-market presentation restore point

Target: `ball46-production` only. Domains: `ball46.com`, `www.ball46.com`.

Verified baseline: `2960e38d-7415-4355-9f62-a1a24487d89c`, deployment `864703b0-b1b2-47ac-b589-32e6961cf269`.
Baseline source: `9887f38b48ac12fd512030afea8fabfc751e21d1`, V13 stable Featured and league-flag fixes.

Approved candidate: `3da48773-796b-4076-b6f1-3cd70fd6eea5`.
Presentation source commit: `6a77e7adcf32ea977e2366bcf80d7b5d17d728e4`.
Activation request commit: `4e6e307e524361bd49ee252a2b1db135e39ac2af`.

The guarded rail is `.github/workflows/ball46-league-market-signal-20261023.yml` on branch `codex/ball46-league-market-signal-20261023` in `mccareysupon-png/nomadtips3-live-test`.

If this exact candidate is still Active and no newer work is present, change only `deploy-assets/league-market-signal-20261023/request.json` to phase `restore`, retaining base/candidate IDs and supplying a fresh authenticated routes audit. Commit/push through this rail. It checks ownership, configuration, version/module hashes and current Active before switching traffic back to the verified baseline. It then waits for two stable baseline public responses and verifies all retained public resources. It never edits Ledger or football engines.

If another version is Active, STOP: do not overwrite another chat's newer deployment. Reconcile that source and narrowly revert this presentation change on top of it.

Before declaring recovery, verify the workflow and actual `https://ball46.com` UI/API state. The activation rail also automatically restores this baseline if its post-cutover verification fails while the candidate is still Active and configuration is unchanged.
