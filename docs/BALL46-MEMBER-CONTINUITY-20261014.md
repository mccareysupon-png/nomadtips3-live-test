# BALL46 MEMBER — CONTINUITY / HANDOFF (2026-10-14 Asia/Bangkok)

## CRITICAL: Do not confuse Member 1 and Member 2
- **Member 1** = existing `ball46-member-production` Cloudflare Worker, sources under `ball46-member/` on branch `member/ball46-member-v1-20261008`. The user **confirmed Member 1 works** after an isolated-worker deployment on 2026-10-14 Thailand time. It is NOT proof that Member 2 is repaired.
- **Member 2** = separate isolated registration/UI work, branch `member2/isolated-ui-and-registration-20261011`, with additional release protection. Its live hostname/Worker deployment target MUST be discovered and verified rather than guessed. **Member 2 recovery is not verified.**
- Never deploy the Member 1 Worker thinking you are repairing Member 2.

## Verified Member 1 deploy
- GitHub Actions workflow: `.github/workflows/deploy-ball46-member-v1-20261008.yml` in branch `member/ball46-member-v1-20261008`.
- This workflow explicitly checks out immutable source commit `2d83fa8829271ab086c10020a4684151ad82580d`, not the branch HEAD.
- Recovery-trigger commit `9086ec7cbcaa4083f7bbbee654a9ff33dd639042`.
- Successful GitHub Actions run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/38439023189 (job steps: validation, dry run, Worker deploy, and unauthenticated/security API gates PASSED).
- User subsequently confirmed Member 1 is working.
- Tests did NOT verify logged-in member content, every UI pixel, or Member 2.
- Do not alter or redeploy Member 1 without explicit instruction.

## Current intended task / repair definition
- User demands restoration of the originally working **member UI**, all text/numbers/data/cards/pages, and correct connections, **NOT a blind rollback overwriting newer features**.
- User says there are three pages; when scoping Member 2, independently confirm its exact three production routes and UI. Never assume routes based on Member 1.
- Inventory every live route, front-end asset, API endpoint, Worker name, Cloudflare domain and active deployment version before applying changes.
- Preserve engine, odds, signals, auth, Stripe, other production Workers.
- Do only the requested scope; check UI visually and data/API paths after deploying. A successful GitHub commit is not a successful production repair.

## Member 1 known wiring (not automatically Member 2)
- Member 1 static assets: `ball46-member/public/` (including `member.html`, `pricing.html`, `login.html`, `success.html`, `styles.css`, `member.js`).
- Worker `ball46-member/src/worker.js` reads main site `https://www.ball46.com` via `/api/engine/statistics`, `/api/engine/board`, `/api/engine/history`; serves `/api/member/daily`, `/api/member/match`, `/api/member/session`.
- A CSS modification targeting `.premium-side-fact.premium-fact-stadium` was reverted on the Member 1 branch, SHA restored to `c0cfe81de2cdaddf49ede086935b6fa9e2ba18f2`; this never by itself established live production state.
- A separate Member 2 branch UI request was changed in commit `440804d2dc9e6b1be945fb0afa714102ea1ebaf7`, **not deployed**.
- Avoid equating `live=1` vs `refresh=1` with the cause of broken layout; this was not proved.

## New-chat instruction
Read this file first; confirm exact Member 2 production domain, Worker, active version and broken route before touching code/deployment. Member 1 is working; do not sacrifice it again. This file is documentation only and does not trigger deploy.
