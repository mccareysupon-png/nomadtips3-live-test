# BALL46 SIGNAL heading — restore point

Worker: `ball46-production`, domains `ball46.com` and `www.ball46.com`.

Verified baseline version: `3da48773-796b-4076-b6f1-3cd70fd6eea5`.
Baseline deployment: `45bae34e-7eed-48e8-b777-5b9355927e2d`.
Baseline source commit: `6a77e7adcf32ea977e2366bcf80d7b5d17d728e4`; this retains the approved three market headings, existing Signal count badges, V13, SEO and all preceding work.

Approved candidate: `917557b5-5622-4ac6-b2a3-fcee9779dddb`.
Source commit: `3f22766d581c6a3afe92df29c74ba961a7688789`.
Activation request: `4cfab3a75a9571ebfbb3484b040a5e132f08c5e4`.

Repository `mccareysupon-png/nomadtips3-live-test`, branch `codex/ball46-signal-heading-20261023`, workflow `.github/workflows/ball46-signal-heading-deploy-20261023.yml`.

To restore only while this candidate is still Active and configuration is unchanged: refresh authenticated routes audit, change `deploy-assets/signal-heading-deploy-20261023/request.json` to phase `restore`, retain the exact base/candidate IDs, then commit/push through this guarded workflow. It checks version ownership and module hashes, current Active, settings/bindings/schedules/domains/routes and backend health before writing traffic. It restores the baseline traffic, waits for two stable baseline public observations and verifies every retained public path. It does not write football data.

If another version has become Active, STOP. Do not overwrite newer work from another chat. Reconcile that source and remove this presentation change on top of the newer version instead.

The activation workflow automatically restores the exact baseline if post-cutover verification fails while this candidate is still Active and configuration remains unchanged. A rollback has not been requested or executed. Confirm workflow and actual ball46.com UI/API behavior before reporting recovery.
