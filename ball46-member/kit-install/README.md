# BALL46 Member — Premium 16 Kits (STAGED; NOT DEPLOYED)
This branch is a staging and read-only audit branch **only**. No changes have been deployed to production.
The approved 16 original PNG images are in the user-provided conversation ZIP, which cannot currently be sent as binary assets via the connected GitHub writing interface. Do not deploy placeholders, stale HTML or missing images.

- Confirmed member worker: `ball46-member-production`; domain `member.ball46.com`.
- Active at read-only audit: `1898aa65-31d8-45bd-aa08-82d455a924d2`.
- Protected `/member` routes redirect to Cloudflare Access. Browser visual tests need an authenticated member session in a Candidate environment.
- `member.js` active sha256: `1ede22f4a3c100bf96088ff2eabdb4097ce074f87ecbd886854454805664fee6`.
- `styles.css` active sha256: `1c4deaee6fc0885ce4c24f3f45f739af624814d4be4c1988fc6e3951a7e376d2`.
- Add only `/assets/premium-kits/kit_01.png` … `kit_16.png`, expanded-card DOM additions, and scoped CSS.
- Use the immutable 8 home/away presets in `premium-kit-presets.json`.
- Seed by Fixture ID, falling back to league, home, away, kickoff. No random per render.
- Existing monogram crest remains as fallback while the PNG loads or if it fails.
- No edits to Stripe, OTP, payment, datafeed, signals, statistics, settlement, cron, or `ball46.com`.
- Reconfirm active version and exact original JS/CSS before applying patch, and verify 16 HTTP 200 PNGs before activating Worker.
- Only after authenticated Desktop/Mobile Candidate visual tests pass may the operator deploy with rollback guarded against foreign deploys.

The implementation package with all 16 actual PNG assets plus patch builder is supplied as a downloadable ZIP in the ChatGPT conversation.