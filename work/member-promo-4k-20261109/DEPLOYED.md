# Deployed — close-up member athlete portrait

Verified 9 Nov 2026 on https://ball46.com and https://www.ball46.com.

- Worker: ball46-production
- Active version: e41be683-e67f-4023-9492-2b114203f0d7
- Deployment: 20efc3b9-6bd4-446b-9cb1-2a9a9ce526e2
- Source branch: codex/ball46-member-promo-20261104
- Release commit: 2d159bc6a30c22c886be8ad2d26e159aa5f48ef3
- Evidence commit: 6bd00c5065fa346273c6f0170d3071994b3f4efe
- Successful run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42623958279
- Immediate rollback: 78ead4f6-0449-47e1-a3da-dc37099a428b; previous deployment e48cfc09-c663-4bab-9da8-876f43adc1b7. Recheck current active version before any rollback; restore only while this owned candidate remains current.

Only member-promo-assets-20261104.txt changed among 41 Worker modules. Main and all 40 other modules are byte-identical. Current asset bundle, bindings, compatibility, schedules, domains, subdomain and five bound-service versions preserved. Stored owner API setting remains 10 seconds; existing runtime safety fallback may choose 30 seconds and was not changed.

Web photograph: /b46-member-athlete-20261109.webp?v=1, 1672 x 941, 1,374,906 bytes. SHA256 b98f44e4a5d022db57383d219e9a5643f7832f03cd9e112458d13219739563d9. Lossless WebP matches all native source RGBA pixels. The requested 3840 x 2160 locally upscaled PNG is retained in assets/member-athlete-4k-upscaled.png; it is not native generated 4K detail.

Previous full photograph entry was replaced to stay within the Worker compressed-size budget; it remains recoverable in the exact immutable rollback version and local source. Original legacy JPEG and every other asset are retained. Compressed Worker modules total 9,657,451 bytes, below 10 MiB.

No card size, CSS, copy, membership link, letter animation, backend or configuration changes. Card 156px desktop / 160px mobile, 12px before Featured Match. Target remains https://member.ball46.com/pricing with blank/noopener/noreferrer.

12 automated UI cases pass: candidate, actual-origin browser-only shadow, Production, each PC/mobile x light/dark. Reduced-motion case passes. No JS errors, unexplained failed resources, own-server writes or direct provider attempts in isolated cases. Existing cache-only screen reads remain about 5 seconds. Engine health HTTP200/ok and HUB cacheOnly/externalRequestsAdded0 verified before and after. 55 public resources per domain verified against expected bytes; raw immutable-origin HTML verified separately from Cloudflare public font transformations.

Test scope: provider-backed full-odds/referee/history requests and unrelated statistics/vote reads were suppressed only in automated browser contexts, avoiding extra upstream traffic. Their runtime/service code was preserved, but this photo release does not certify those unrelated backend features.

Actual in-app Production PC/light/dark and mobile390/light/dark independently inspected. New photo decoded correctly, live scores rendered, one visible promo, no overflow. Screenshots live-pc-light.png, live-pc-dark.png, live-mobile-light.png, live-mobile-dark.png in release-audit. Temporary viewport reset; Production tab left open.
