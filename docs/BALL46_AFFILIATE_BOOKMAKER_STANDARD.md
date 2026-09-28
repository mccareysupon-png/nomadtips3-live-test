# Ball46 Affiliate Bookmaker Standard

## Scope
This standard applies only to bookmaker presentation in Ball46 Full Market.

## Current verified books
- `1xbet`
  - affiliate: `https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97`
  - logo source: `https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png`
- `williamhill`
  - affiliate: `https://campaigns.williamhill.com/C.ashx?btag=a_189870b_33c_&affid=1739384&siteid=189870&adid=33&c=`
  - logo source: `https://upload.wikimedia.org/wikipedia/commons/8/87/William_Hill_logo.png`

## Rendering rules
1. The bookmaker tab shows the bookmaker logo for affiliate-enabled books. The logo is visual identification only and MUST NOT be wrapped in an anchor.
2. Logo geometry must fit the existing bookmaker tab without increasing tab/card height. Target maximum visual box: 50px wide x 12px high.
3. Only actual price/odds values are affiliate anchors.
4. Handicap/total LINE values are never affiliate links.
5. Price links preserve the native table appearance: inherited font/color, no underline, no layout expansion. Hover/focus may brighten only.
6. Affiliate links open in a new tab with `rel="sponsored noopener noreferrer"`.
7. Full Market renderer owns affiliate markup. Do not restore a post-render DOM scanner/decorator in `odds-format-343.js` or elsewhere.
8. Bookmaker names/slugs are sourced from the live Full Market renderer. Never guess a slug.

## Safe rollout
- Start from CURRENT Production, never an old branch asset bundle.
- Preserve current Worker runtime, bindings, compatibility date, cron, and all unrelated assets.
- Hard diff gate: only `full-market-bookmaker-343.js` and `full-market-bookmaker-343.css` may change for logo/link presentation unless a separately proven blocker requires another file.
- Race guard immediately before deploy; abort if Production version changed during preparation.
- Browser verification after propagation must prove for both books:
  - logo is present in the bookmaker tab;
  - logo is not inside `<a>`;
  - at least one numeric price renders as `a[data-b46-affiliate-odds="<slug>"]`;
  - href matches the verified affiliate URL;
  - LINE cells remain plain text;
  - other bookmakers remain unchanged.

## Adding the next bookmaker
Add only after the affiliate URL and live Production slug are verified. Extend the central affiliate/logo maps; do not create bookmaker-specific render logic.