# Pinnacle.com Structure Research — GPT Bot Project Note

Date: 2026-08-12
Scope: Public-site structure, soccer market taxonomy, live-betting behavior, URL/routing observations, and integration constraints relevant to NOMADTIPS3 Car 3.

> IMPORTANT PROJECT BOUNDARY
> Car 3 remains PAPER-ONLY. This note is research/reference material only. It does not authorize website login automation, scraping, bet placement, or real-money transactions. Any future connector must be separately reviewed against Pinnacle's current permissions/terms and only use an expressly authorized interface.

## 1. Public sportsbook structure

Pinnacle exposes a locale-prefixed sportsbook structure. Public event pages observed in search results follow a route pattern similar to:

`/{locale}/{sport}/{league-slug}/{matchup-slug}/{numeric-matchup-id}/`

Examples observed publicly include soccer routes such as:

`/en/soccer/italy-serie-c/catania-vs-ascoli/1631401093/`

The numeric matchup ID appears to be the most stable identifier in the visible route, while sport/league/team names are human-readable slugs. Old event routes may later return `Matchup not found`, so the public URL is not a durable historical data source.

The site shell exposes the following top-level areas in current indexed pages:

- Sports Betting
- Live Centre
- Casino
- Live Casino
- Virtual Sports
- Betting Resources
- Search
- Login / Join
- Odds-format selector
- Language / locale
- Help

Footer/support structure includes:

- Sports betting categories (Soccer, Basketball, Baseball, Football, Tennis, Hockey, Esports)
- Corporate / Press / Affiliates / Why Pinnacle
- Responsible Gaming
- Terms & Conditions
- Privacy Policy
- Cookie Policy
- Contact / Betting Rules / Bets Offered / Help / Sitemap / Payment Options

## 2. Website views

Pinnacle documents three sportsbook website views:

1. Beta View — streamlined navigation and faster performance; broadly available.
2. Classic View — available outside the EU according to Pinnacle help content.
3. Asian View — aimed at customers in Asia.

For future UI research, do not assume DOM/layout consistency across these views.

## 3. Soccer event model

For NOMADTIPS3 normalization, model a Pinnacle soccer offering as:

`Sport -> League/Competition -> Fixture/Matchup -> Period -> Market -> Selection -> Line -> Odds`

Recommended internal fields for reference mapping:

- `source = "pinnacle"`
- `sport`
- `league_name`
- `fixture_source_id` (numeric matchup id when available)
- `home`
- `away`
- `start_time`
- `is_live`
- `period` (match / first half / other period)
- `market_type`
- `selection`
- `handicap_or_total_line`
- `odds_decimal`
- `observed_at`

This is a normalization recommendation for our paper system, not a claim about Pinnacle's private backend schema.

## 4. Soccer market taxonomy confirmed by Pinnacle

Core market families documented by Pinnacle include:

- Money Line / 2-way
- 1X2 / 3-way
- Handicap
- Asian Handicap
- Asian Handicap quarter-goal lines
- Totals / Over-Under
- Asian Total quarter-goal lines
- Team/Player Total
- Both Teams To Score
- Both Teams To Score + Total
- Both Teams To Score + Winner
- Corners
- Bookings/cards-related markets
- Minute Markets
- Next Team To Score
- First Team To Score
- Winner/Total
- Winning Margin / Winning Margin Range
- Futures
- Multiples/Parlays

For the NOMADTIPS3 live detector, the most relevant normalized groups are initially:

- `AH` — Asian Handicap
- `OU` — Asian/standard Totals
- `1X2`
- `BTTS`
- optionally `CORNERS` and `BOOKINGS` later

## 5. Asian Handicap semantics

Pinnacle explicitly documents quarter handicaps. Example:

`-1.25` means the position is split across `-1.0` and `-1.5` at the displayed odds.

Therefore the bot must NEVER normalize `-1.25` as equivalent to `-1.0` or `-1.5`.

Recommended normalized representation:

```json
{
  "market": "AH",
  "side": "home",
  "line": -1.25,
  "odds_decimal": 1.91
}
```

If settlement simulation is needed in PAPER mode, quarter lines must support full win, half win/half push, push, half loss/half push, and full loss.

## 6. Live / In-Play semantics that matter to the detector

Pinnacle's soccer rules state several important live-market behaviors:

- In-Play 2-way Asian Handicap is settled using the score for the remaining period after the bet is placed; goals already scored are ignored for that handicap result calculation.
- Live bets may be delayed or held pending in dangerous situations.
- Score, corner, and red-card information are considered part of the live market context; materially incorrect displayed information can affect settlement.
- VAR can cause affected in-play bets to be voided when it materially changes the relevant odds/outcome context.
- Asian Handicap and Total quarter-lines retain their split-line settlement logic.

For a PAPER detector, always store a timestamp and the contemporaneous match state with the observed line:

- minute
- score
- red cards if known
- period
- observed line
- observed odds
- source timestamp / local observed timestamp

Never compare an in-play AH price without also comparing the current score and period.

## 7. Odds format

Pinnacle documents Decimal and American odds formats. For NOMADTIPS3, normalize all source odds to Decimal internally.

Do not store display-format strings as the canonical value.

Recommended:

`odds_decimal: number`

## 8. Dynamic-line / bet-slip behavior

Pinnacle documents a dynamic-lines workflow in which odds can move after a selection is chosen. The confirmation stage can show updated odds, and some selections can be partially accepted while another selection needs resubmission. Pinnacle also documents settings such as Auto Refresh and Accept Better Odds.

Design implication for PAPER simulation:

A market observation is ephemeral. Treat `(fixture, period, market, selection, line, odds, observed_at)` as a snapshot, not permanent truth.

Do not let a later line overwrite an earlier observation without history.

Recommended append-only odds history record:

```json
{
  "source": "pinnacle",
  "fixture_source_id": "...",
  "period": "MATCH",
  "market": "AH",
  "selection": "HOME",
  "line": -0.5,
  "odds_decimal": 1.91,
  "score": "0-0",
  "minute": 34,
  "observed_at": "ISO-8601"
}
```

## 9. Live Centre / login boundary

Current indexed pages show `Log in or Join to access the Live Centre`.

Therefore public unauthenticated visibility is not equivalent to what an authenticated customer sees. Do not design a connector around the assumption that Live Centre data is publicly accessible.

## 10. Rendering / selector stability

Observed current soccer root/event pages are heavily dynamic from a crawler perspective: the soccer root can expose almost no static page text, and expired event routes often resolve to a shell plus `Matchup not found`.

Inference for engineering: do not make a production design depend on brittle CSS/XPath selectors from one visible website view. Beta, Classic, Asian, locale, login state, responsive layout, experiments, and event expiration may all alter page structure.

If Pinnacle ever provides explicit written permission and an authorized API/feed, prefer that over DOM extraction.

## 11. API / authorized data access

Pinnacle's affiliate documentation currently states that delayed/non-delayed API access exists in an affiliate context and that API access can be limited/revoked based on affiliate criteria.

This does NOT mean there is an unrestricted public retail odds API for our bot.

Before any future connector:

1. Verify the current authorized API/feed program directly with Pinnacle.
2. Obtain explicit permission/credentials for the intended use.
3. Confirm rate limits, redistribution rights, storage/history rights, and whether automated use is permitted.
4. Keep credentials in server secrets / `.env`, never in source control or chat logs.

## 12. Critical terms / scraping restriction

Current Pinnacle terms pages state that website data such as odds, lines, markets, statistics, fixtures, and betting figures are for personal use and prohibit scraping / automated access / extraction without express authorization. Pinnacle also states its sports odds/content are proprietary and may not be copied or disseminated without permission.

Therefore:

- DO NOT build an unauthorized scraper against pinnacle.com.
- DO NOT bypass access controls, rate limits, bot protection, login restrictions, or technical protections.
- DO NOT treat public HTML as a licensed data feed.
- Use Pinnacle as a market-structure/reference source unless/until authorized access is obtained.

## 13. Recommended role inside NOMADTIPS3

Safe/current role:

`Pinnacle = reference model for soccer market structure and line semantics`

Current Car 3 PAPER flow remains:

`Live Detector -> normalized signal -> Paper Runner -> WOULD_EXECUTE -> audit log`

A future authorized market-data adapter, if permission exists, should be isolated behind an interface such as:

`MarketDataProvider -> normalized odds snapshot -> detector/paper runner`

This keeps the rest of the system source-agnostic and allows API-Football, an authorized odds feed, or another licensed provider to be swapped without rewriting the detector.

## 14. Suggested provider-agnostic market interface

```ts
interface OddsSnapshot {
  source: string;
  fixtureSourceId: string;
  observedAt: string;
  isLive: boolean;
  period: string;
  minute?: number;
  score?: string;
  market: "AH" | "OU" | "1X2" | "BTTS" | string;
  selection: string;
  line?: number;
  oddsDecimal: number;
}
```

This schema is suitable for PAPER analysis and comparison without coupling Car 3 to Pinnacle's website implementation.

## Official sources reviewed

- https://www.pinnacle.com/en/future/betting-rules/
- https://www.pinnacle.com/en/future/bets-sports-offered
- https://www.pinnacle.com/en/help/knowledge-base/improving-the-bet-placement-process
- https://www.pinnacle.com/en/esports-hub/help/placing-a-bet
- https://www.pinnacle.com/en/esports-hub/help/odds-explained
- https://www.pinnacle.com/affiliates/faq
- https://affiliates.pinnacle.com/terms_and_conditions.asp
- Current Pinnacle Terms & Conditions pages (including jurisdiction-specific versions surfaced on pinnacle.com)

## Re-check trigger

Re-check this research before implementing any future adapter because Pinnacle can change website views, routes, terms, API availability, and permissions.