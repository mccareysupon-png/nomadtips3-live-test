# BALL46 Statistics: obsolete loading animation + legacy UI removal

**Status:** ACTIVATED and VERIFIED in Production at 100% traffic on 2026-11-16, 15:17 UTC (22:17 Asia/Bangkok).

**Only requested changes**
1. Deleted the *source code* that injects the obsolete **Loading statistics** animated skeleton and fake bar chart. Removed 13,734 bytes.
2. Replaced the obsolete October 2026 hydration/old-UI overlay guard to prevent intermediate legacy statistics display. Preserved real chart, verified snapshot, all market tabs, original settlement formulas and history.

**Production Worker:** `ball46-production`
**New active version:** `183f194b-0354-4366-8bca-9b17ca6458b0`
**Rollback version:** `2c585c34-177b-458a-848a-25353aa19830`
**GitHub Actions source of truth:** https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43893943873

The release changed only `statistics-menu-entry-20261114.mjs`; all other **51 Worker modules**, bindings, original assets, Engine, Ledger, and existing fast snapshot service remained unchanged. Live and inactive Candidate browser checks passed on desktop Total, desktop filtered 1X2 and mobile Total. Tests verified zero legacy loader DOM insertions, zero old UI visible frames, no obsolete script or style in HTML, no JS errors or horizontal overflow, and successful native history handoff. Auto-rollback guard was available but was not triggered.

**Important:** This is a UI-source deletion, not an incremental-Ledger financial accounting architecture change. Do not claim that the entire original historical statistics calculation has been removed by this release.
