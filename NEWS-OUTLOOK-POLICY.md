# NOMADTIPS3 Daily Betting Outlook Policy

## Purpose
Publish one concise, responsible, data-supported Betting Outlook each day. The page is editorial guidance, not a promise of profit and not a signal to increase spending.

## Schedule
- Daily review time: 08:00 Asia/Bangkok.
- Primary public source: https://www.nomadtips3.com/statistics
- Secondary source for previous published state: https://www.nomadtips3.com/news.html and repository `news.html`.

## Required data before issuing a view
At minimum, obtain a current cumulative unit value and settled-record count from the public Statistics page. Prefer also obtaining ROI, WIN, LOSS, PUSH, Win Rate, Average Odds, RSI and current Drawdown.

If the required data is missing, stale, contradictory or obviously incomplete, publish:

`DATA REVIEW IN PROGRESS — NO BETTING VIEW ISSUED`

Never guess missing values.

## Editorial status vocabulary
Use only these public statuses:
- FOLLOW — constructive conditions with a sufficiently established positive record.
- FOLLOW SMALL — constructive but still early, near a prior high, mixed, or not strong enough to justify normal confidence.
- WAIT — unclear, flat or conflicting conditions; no action is required.
- DEFEND — deterioration or enlarged drawdown; reduce exposure and prioritize bankroll protection.
- NO VIEW — data quality gate failed.

Do not auto-publish `FOLLOW STRONG`, `ALL IN`, `MAX BET`, recovery staking or any wording that encourages escalating stake size.

## Interpretation framework
Use context, not one threshold alone.

Consider together:
1. Current cumulative units and change versus the previous published Outlook.
2. Current drawdown from the previous peak.
3. RSI / momentum when available.
4. ROI and settled-record count.
5. Win/Loss/PUSH structure; PUSH is not a loss and is excluded from Win Rate denominator when independently calculating Win Rate.
6. Operating age of the current public record.
7. Any visible data-quality warning.

Useful context cues:
- Positive units with small drawdown near zero can be described as holding or testing the upper range.
- Drawdown exactly at zero with an improved cumulative unit figure can be described as a new high only when the source supports it.
- A rising total does not justify increasing stake size.
- A short operating period must remain labelled early validation.
- If signals are unclear, WAIT is a valid outcome.

## Writing style
Use international English and the NOMADTIPS3 research-note voice:
- calm, analytical and concise;
- similar in structure to a market/fund outlook without calling betting an investment product;
- football/betting vocabulary is acceptable;
- no hype, guarantees, wealth imagery or claims of a proven edge without sufficient evidence.

Maintain these sections in `news.html` where present:
- Date / operating day / Human reviewed
- Headline
- Current result
- Trend / phase
- NOMAD View
- Risk Outlook
- Market View
- Today's Approach
- What Changes Our View
- Early Validation
- Bottom Line
- Responsible betting disclaimer

## Stake guidance
Default language is fixed or small planned stake only. Never recommend chasing losses, martingale/recovery staking, borrowing, or using money required for essentials.

Preferred principle:
`NO SIGNAL. NO BET. KEEP YOUR MONEY.`

## Publishing rules
- Update only `news.html` for the daily editorial content unless a structural defect requires repair.
- Do not change live-engine, feed, odds, settlement, D1 or signal logic as part of the daily Outlook.
- Preserve `news.css`, `news-bg.svg`, shared icon assets and the shared footer unless a separate explicit maintenance task requires changes.
- Before writing, fetch the current `news.html` and use its latest blob SHA.
- Commit message format: `Daily Betting Outlook YYYY-MM-DD`.
- After the commit, verify the public `https://www.nomadtips3.com/news.html` when possible.
- Create a small archive note at `news-archive/YYYY-MM-DD.md` containing the source metrics, issued status and 2–5 sentence rationale. If that date already exists, update it rather than creating a duplicate.

## Safety gate
When uncertain between a more aggressive and a more conservative status, choose the more conservative status. The Outlook exists to help users avoid unnecessary bets as much as to identify constructive conditions.
