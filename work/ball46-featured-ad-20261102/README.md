# BALL46 Featured Match – approved 1XBET ad preparation (2 Nov 2026)

## Source of truth, READ ONLY
- Cloudflare Worker: `ball46-production`; 2 Nov 2026 12:35:15 UTC active version `224cac7e-11fe-4549-a462-8f2f0e3ef25f`.
- Active `assets/index.html` sha256 `4dbdb46a79970dd1b1c7f3707206d3465307796640b919319a55731fe587b33c`.
- Active `index.js` sha256 `158e61f73469af35512e77c3a91ada3f0e928660f0f141036dd785b808c780c2`.
- 39 modules. Audit: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41445882358

## Strict change scope
- Only card: `.featured-card[data-featured]`, insert directly after `.card-title`.
- Full-length portrait image, not cropped (1024×1536).
- External click link must be `https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97`, with new tab and sponsored/noopener/noreferrer.
- Animate **ticker letters only**. Leave image, match scores, match facts, and signals static.
- No Engine, HUB, Member, API, Ledger, Odds, Settlement, scheduler or unrelated asset changes.

## Attached package files
Use user-provided bundle `ball46-featured-affiliate-deploy-package.zip` containing `b46-featured-1xbet-20261102.webp` (optimized exact portrait), `featured-ad.js`, `featured-ad.css`, `patch.mjs`. The three text files also exist on this branch.
DO NOT use a source image guessed from an old repository or an external host.

## Deployment guard
Re-read exact active Cloudflare production version and every module and asset (do NOT deploy repo main); stage exact current modules, add only approved three assets, patch active index.html with `patch.mjs`, preserve current bindings/settings/crons, use candidate version first, verify all original module hashes unchanged except index.html, then promote only with prior active version lock. Stop if any check fails. Record new version and preserve rollback ID. Verify PC, mobile, ad link, animation and live match rendering after deploy.

Status: **PREPARED, NOT DEPLOYED.** Direct Cloudflare mutation has not been attempted because the safe image upload and exact-current asset preservation path are not yet fully exercised from this chat.