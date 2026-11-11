# BALL46 Global SEO + AI Search V1 — isolated test (2026-11-11)

**TEST ONLY. NOT PRODUCTION. NO DEPLOY.**

This folder is a *separate, non-routed* SEO content preview. Do not publish this HTML directly and do not copy the repository root `index.html`: root currently advertises NOMADTIPS3 and is not the current BALL46 Production page.

## Marketing and relevance
**Can't analyze football? Let BALL46 help you for free.**

Search intent: free football analysis, live predictions, live football scores, match statistics, responsible football analysis. Public content is free where available; membership features may be paid. Never promise that predictions make people rich or guarantee income.

Draft EN SEO title: `BALL46 | Free Football Analysis, Live Predictions & Scores`

Draft EN meta description: `Explore free football analysis, live scores, match statistics and data-driven predictions with BALL46. Understand the game and make informed decisions.`

Public Q&A concepts:
- How can BALL46 help me analyze football matches? Available live scores, match statistics, and data-driven predictions give additional context to follow games.
- Is BALL46 free? Free public resources are available; specific member features may have access requirements.
- Does BALL46 guarantee profits? No. Football predictions are uncertain and never guarantee profit.

## Integration gate — **do not bypass**
1. Verify live Cloudflare Worker `ball46-production` and its actual **currently active** assets, commit, and domain routing. Do not assume any GitHub branch is the current Production source.
2. Build an independent test preview directly from that captured current source, without overwriting it or deploying any older code.
3. Patch only scoped public homepage SEO fields. Ensure one title, canonical, description, appropriate OG/Twitter tags, and visible concise HTML content for humans and crawlers. Retain protected owner/member pages and all API/Signal/Ledger code.
4. Do not add APIs or hide crawler-only content. Add hreflang only for real, self-canonical, accessible localized URLs; retain Thai and Vietnamese and prioritize EN/ES/ID/PT-BR among other markets.
5. Test HTML response/indexability and robots/sitemap *as served by Cloudflare*, PC/mobile UI, live card rendering/performance, and SEO no-duplicate assertions before proposing any Production rollout.
6. Deploy Production only after the owner separately authorizes it.

This branch has **no** deployment or automation path. The sample HTML is deliberately `noindex,nofollow`. The production site and DNS remain untouched.

Official reference: https://developers.google.com/search/docs/appearance/ai-features
