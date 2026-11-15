# BALL46 — Statistics Workstream Registry

**Registry:** https://github.com/mccareysupon-png/nomadtips3-live-test/issues/371

**Registered:** 2026-11-15 · Owner-directed. The GitHub issue above is the shared coordination and decision register for both teams.

| ID | Registered name | Team | Workspace | Status |
|---|---|---|---|---|
| `B46-STAT-CHAT-01` | **BALL46 Statistics — GPT Chat** | ChatGPT Chat | `chatgpt/ball46-statistics-v1` → `chatgpt-statistics/`; target `ball46-chat-statistics-staging` | Source committed; real-data validation/staging deploy pending |
| `B46-STAT-WORK-01` | **BALL46 Statistics — GPT Work** | GPT Work PC | Local path reported: `work/statistics-incremental-design-20261115/`; remote branch **not verified** | Prior task interrupted; preserve any local work |

## Equal authority, separate responsibility

- GPT Chat and GPT Work have **equal development authority** to design, implement, test, review and propose staging deployment. Neither one supersedes the other.
- **Do not edit, overwrite, merge, rebase, or deploy the other track's work** without the owner authorizing the specific crossover. Separate branches, commit history, data stores, runtime names, reports and rollback snapshots.
- Both must distinguish **code written**, **tests run**, **real-event correctness verified**, **staging deployed**, and **Production deployed**. Never claim later stages passed from earlier stages.
- **No Production deployment or credential/security change without specific owner approval.** The Production location/version is documented separately at https://github.com/mccareysupon-png/nomadtips3-live-test/issues/366 .
- If the two tracks disagree, record both findings in issue #371 and ask the BALL46 owner to decide.
- Never assert a Work branch exists just because a Work PC directory was mentioned. Verify its Git branch/commit before adding it to this registry.

## Shared functional requirement

Incremental stats for actual BALL46 outcomes: calculate once at settlement; persist global/market/day totals; identical replay must not double count; corrections subtract prior contribution and add the verified new contribution; old ledger is for display/audit and initial migration, not repeated summary calculation. Preserve London sport-day cutoff, settlement categories and official Engine logic. Do not invent Profit/ROI where units or values have not been verified.

## Operational update log

- 2026-11-15: Created two independent named track identities and shared registry #371.
- 2026-11-15: Registered Chat source branch; Work remote branch and actual deployment status remain unverified.
- No runtime changes are made by this registration.
