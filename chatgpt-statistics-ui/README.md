# B46-STAT-UI-01 — BALL46 Statistics 50/50 browser layout

**Team:** GPT Chat (equal development authority to GPT Work)  
**Track:** `B46-STAT-UI-01` — UI-only, separate from the incremental calculation track `B46-STAT-CHAT-01`  
**Git branch:** `chatgpt/ball46-statistics-ui-v1`  
**Registry:** https://github.com/mccareysupon-png/nomadtips3-live-test/issues/371  
**Production registry:** https://github.com/mccareysupon-png/nomadtips3-live-test/issues/366

## Browser preview

Open `preview.html` in any browser. It has no CDN, API calls, external assets, Cloudflare Worker bindings, or data writes.

This is an **isolated visual preview**, not a deployed implementation of the real statistics page. The headline/summary figures are transcribed from the 15 Nov 2026 user screenshot (15,454 settled; +1354.27 U; ROI 8.8%; win rate 54.5%; odds 1.96; 7,437 winning; 5,365 losing; 2,652 neutral; 290 awaiting settlement; max drawdown -66.99 U). The chart line's **intermediate daily values are illustrative estimates** matching the screenshot's general shape; they are *not real ledger data*. ROI and Win Rate daily plots intentionally show an explicit unavailable state instead of fabricated history.

## UI specification

- At **desktop widths >850px**, 2 equal-width cards: a compact performance chart on the left and detailed result/KPI panel on the right.
- Reduce chart height to ~224px desktop, stroke to ~2px, headline from oversized to ~25px, typography to 10–16px elsewhere.
- Details card: ROI, win rate, average odds, settled count; W/L/neutral distribution; cumulative P/L, stake, pending, max drawdown.
- At **mobile/tablet <=850px**, stack the cards vertically, with no horizontal overflow.
- Keep metric and time-range switches interactive in the preview; do not claim daily ROI/Win-rate data exists based on one screenshot.
- No changes to settlement formula, ledger, Engine, API, Production UI, or other GPT Work code.

## Browser QA (local headless Chromium, 15 Nov 2026)

- Desktop 1440px — left/right cards 690px each; controls PASS; zero JS errors; no overflow.
- Small desktop 1024px — left/right cards 486px each; controls PASS; zero JS errors; no overflow.
- Tablet 820px — stacked; controls PASS; zero JS errors; no overflow.
- Mobile 390px — stacked; controls PASS; zero JS errors; no overflow.
- Narrow mobile 320px — stacked; controls PASS; zero JS errors; no overflow.

**Next:** Owner reviews the visual. Actual production integration requires studying the current active `/longterm-performance-343.js` module source and performing exact-scope visual-only patch + regression tests in separate staging. Production deployment requires distinct owner approval.
