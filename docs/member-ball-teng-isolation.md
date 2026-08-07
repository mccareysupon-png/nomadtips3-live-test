# Member Ball Teng — isolated copied-engine test

The member selector reuses the same NOMAD Ball Teng engine components as the Owner/System selector, but it runs them inside a temporary working directory with member-specific configuration and state files.

## Wiring

- Input rules: `/member-ball-teng-config?member=<id>` active config.
- Engine: copied runtime copies of `auto_select_next.py`, `run_ball_teng_selector.py`, `apply_confidence_policy.py`, `finalize_ball_teng_analysis.py`, and `enrich_selected_odds.py`.
- Owner files are read only as engine/default source material; the member workflow has repository `contents: read` permission and cannot publish `selected-live-matches.json`.
- Output: authenticated POST to `/member-ball-teng-ingest`, then D1 `member_ball_teng_sets` and `member_prediction_results` scoped by `member_id`.
- Stale results are rejected when the submitted config version no longer equals the member's active config version.
- TEST API usage is counted across API-FOOTBALL calls made during the copied engine run and accumulated in `member_api_usage` as `ball_teng_selector_total`.

## Run behavior

The member workflow checks every five minutes. A heavy selection run occurs only when the active member config version is newer than the stored member set, when the selection window changes, or when a manual workflow dispatch forces a run. Activating a member config therefore becomes eligible for a fresh member-only selection on the next five-minute check.

This is intentionally separate from the Owner/System automatic selector. It does not modify Owner configuration, Owner selection state, Owner result files, or another member namespace.
