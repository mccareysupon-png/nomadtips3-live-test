# Event Flow SIGNAL no-overlap V2 — scoped candidate, NOT DEPLOYED

Source-of-truth registry #366: 26 Oct current deployment 65c82540-7c0f-4871-88de-9aaa1d1c73f2. This branch begins from the source of the 26 Oct hide-Last5 release, *not* an older Event Flow UI.

Owner requirements: extend original Event Flow visual by +20% of original plot height above, +20% below, keep center attack graph/events intact; background is original field image extended with natural gradient, no stretched texture. HOME cards in top lane, AWAY bottom, O/U whichever lane free; all connectors are straight SVG <line> segments. O/U originates at plot 50% midline for signal minute. Preserve existing signal colors/times and any existing valid connectors.

Files: pure geometry helper + scoped CSS + tests. NO changes to runtime, no deploy, no assumptions about dynamic Event Flow DOM selectors.

**Critical integration:** Inspect actual active Cloudflare 24-module Worker payload and original Event Flow CSS/JS, bind exact selectors and coordinate transform, rebase on current deployed Worker version, and verify on candidate/Preview browser at desktop & 390/360 mobile. Must prove no graph/icon/card overlap for multi-signal cases; no cross-page CSS pollution; preserve 6 APIs, Vote, Signals, Stats, Member, and Last5 concealment. Do not run a production deployment until user explicitly approves.
