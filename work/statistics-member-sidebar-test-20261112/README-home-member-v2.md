# Membership benefits banner V2 — preview only

Two new image_gen edits replace the original italic generic membership invitation in the homepage experiment. Placement remains immediately below LIVE MATCH MONITOR, PC only, full 1:3 proportions, signup destination unchanged. Production is untouched.

Dark: home-membership-dark-v2.png — same adult blonde female athlete, emerald/yellow kit, dark emerald stadium. Light: home-membership-light-v2.png — adult male athlete, same emerald/yellow kit, bright daytime stadium on ivory/mint, dark emerald text. Both the header logo and jersey logo are upright. Final assets are also saved in ../../output/ball46-sidebar-banner/ under the same names. Original image preserved.

Copy verified read-only against https://member.ball46.com/pricing in browser on 2026-11-12. Source heading: Daily signals. One screen. Advertised features: all current-day signals, market filters, today's Win Rate/P&L, expandable Event Flow and match statistics. No return or outcome guarantees. Banner copy: DAILY SIGNALS. ONE SCREEN. / All daily signals / Filter by market / Today's Win Rate & P/L / Event Flow & match stats / JOIN NOW / ball46.com.

Changed code: home-member-promo.js chooses image by the existing html[data-theme] value and watches only theme changes; image alt text includes benefits. home-member-promo.css gives the light card a pale mint backing. No APIs, polling, score or monitor logic changed.

Verified in the actual local preview: both image variants load; each is the immediate sibling after monitor; full 1:3 ratio; membership link remains correct. Dark card 285×855px at 1280px viewport. Light backing computed rgb(239,250,243), actual displayed image is the male/light version. Screenshots: qa/home-member-v2-dark-details.jpg and qa/home-member-v2-light-context.jpg. Source is recorded homepage DOM, not live match data.

Prompts / built-in image_gen edit mode:

Dark: edit original portrait 1:3 membership poster; preserve adult blonde athlete, realistic face and football, emerald kit with yellow trim, emerald stadium. Replace all italic lettering with upright bold sans serif, top logo ball white/46 mint and upright chest ball46. Recompose header top24%, athlete24–68%, benefits68–86%, CTA bottom14%. Exact copy as above. White text, yellow MEMBER eyebrow, mint check icons and CTA, generous 7% margins, readable at285px, no prices or fabricated benefits or win guarantees.

Light: use new dark version as reference and preserve layout/copy. Replace woman with friendly athletic adult male about25 with short light brown hair, same green/yellow kit and upright chest logo. Daytime stadium, ivory-white/pale mint background, no dark panels/night/neon. Dark emerald upright main text, ball dark emerald/46 medium green, gold MEMBER eyebrow, green checks and button with white JOIN NOW. Same exact copy, ratio and margins.
