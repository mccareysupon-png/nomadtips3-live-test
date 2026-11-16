# BALL46 Statistics Fast V1 — visual Hotfix release

**Status:** Production deployed and successfully verified (GitHub Actions run 43885959822, 2026-11-16 14:35 UTC / 21:35 Asia/Bangkok).

- Worker: `ball46-production`
- Active deployed version: `2c585c34-177b-458a-848a-25353aa19830` (100% traffic)
- Previous version / exact rollback: `d2fe6c5e-5602-40f9-9b6f-d4d8674de638`
- Deployment: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43885959822
- Authorizing Git commit: `7a48b8e8a13cd3cd80ccfd6e062e65db22af0578`
- Scope: ONLY module `statistics-fast-v1-js-20261116.txt` changed. Remaining 51 Worker modules unchanged. Engine, Ledger, formulas, original KV, snapshot service unchanged.

## User-reported regressions resolved
1. Filtered market 1X2 and AH: native right-side finance overview no longer has large empty region. Uses existing native KPI W/P/L, STAKE, MAX DRAWDOWN; includes market-specific Outcome breakdown (from already computed original finance values), desktop only. No new API calls or settlement formula changes.
2. Original loading animation/skeleton that showed simultaneously with verified chart is hidden during fast first paint. History click and subsequent native renderer takeover do not overlap with old loader.

## Post-deployment checks
- PC fast first meaningful chart: navigation ~3,071 ms; fast script paint ~422 ms.
- Mobile navigation ~2,463 ms; script paint ~256 ms.
- No statistics Ledger API reads before history click; native full-history load passes afterward (33 API reads PC/mobile in this run).
- Filtered AH deep link and simulated snapshot HTTP503: both fall back to verified native renderer.
- Live JS/DOM regression test passes Total, 1X2, AH, same-session navigation, mobile, simulated 503; no page JS exceptions.
- Verified updated 1X2 W/P/L values sum to 2,328 settled in one late run; AH also reconciled to its own settled count.
- No duplicate graph and no prior loader overlap in tested scenarios.

## Follow-up
User may visually check at https://www.ball46.com/?view=statistics. This is a visual hotfix only; detailed Ledger remains relatively slow. If a new live regression appears, restore 100% traffic to the exact rollback version above, not to an older pre-V1 version. Never change the Engine or Ledger to fix the front end.
