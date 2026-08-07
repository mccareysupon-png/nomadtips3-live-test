# NOMADTIPS3 Member System Isolation

## Goal
Each member owns an independent configuration, result stream, statistics history, and notification stream while sharing the same underlying football-data infrastructure. A member changing conditions must never change Owner/System defaults or another member's data.

## Non-negotiable invariants
1. Every member-owned row is keyed by `member_id`.
2. Owner tables (`condition_config`, `ball_teng_config`, existing scanner state, existing system results) remain separate from member tables.
3. Member Save/Run only changes the selected member's Draft/Active config.
4. Untagged/global records must never be silently counted as a member's personal statistics.
5. Owner/System results must never be used as a fallback display for missing member results.
6. Notifications are addressed and logged per `member_id`.
7. The football provider should be called for shared source data, not once per member.

## Storage introduced
- `member_profiles`
- `member_live_config`
- `member_ball_teng_config`
- `member_notification_settings`
- `member_live_state`
- `member_live_signals`
- `member_ball_teng_sets`
- `member_prediction_results`
- `member_notification_log`

## Configuration lifecycle
Each member has both `draft_json` and `active_json`.

- **Save Draft**: updates only the member draft.
- **Activate / Run**: copies the member draft/config to the member active config and increments the member version by timestamp.
- Owner/System config is unchanged.

A new member is seeded once from the current System active config. After creation, the member copy is independent; later Owner changes do not overwrite member settings.

## Required execution architecture
### Live football
Do not run one API-FOOTBALL poller per member.

Correct architecture:

`API-FOOTBALL -> shared normalized live snapshot -> evaluate all active member rules -> member_live_state/member_live_signals -> per-member notification queue`

The shared snapshot should contain enough data to satisfy the union of active member windows/markets. Member evaluation happens after the shared fetch.

### Ball Teng
Do not publish the Owner `selected-live-matches.json` as a member result.

Correct architecture:

`shared fixture/form/standings/odds data -> run selector using Member A active config -> set A`

`same shared/cached source data -> run selector using Member B active config -> set B`

Each result set is stored under `member_ball_teng_sets` and each settled prediction under `member_prediction_results` with its `member_id`.

## Current TEST foundation
The branch provides isolated storage, member-only read endpoints, and Member #0001 settings UI. It intentionally stops using untagged/global records as personal data.

The live member evaluator and Ball Teng member selector are not yet connected. Until they are connected, member dashboards should show an empty/waiting state rather than substitute Owner/System results.

## Authentication boundary required before real members
The browser query parameter `member=0001` is acceptable only for an isolated TEST prototype. Production must derive `member_id` server-side from an authenticated Login/Session. A user must not be able to change another member's id in DevTools or the URL.

Recommended production request flow:

`Login -> signed/secure session -> Worker resolves member_id -> all member queries use resolved member_id`

Never trust a client-supplied `member_id` for production writes.

## Notification model
Each member needs:
- enabled/disabled status
- channel type
- recipient reference/token stored server-side
- event deduplication key
- send status / retry state
- sent timestamp

The notification engine must consume only that member's signals/results.

## Next implementation order
1. Add authenticated member-session resolver.
2. Build shared normalized live snapshot/fan-out evaluator.
3. Write member live states/signals and notification events.
4. Add independent Member Ball Teng selector using shared/cached source data.
5. Add member-specific settlement -> `member_prediction_results`.
6. Connect per-member LINE recipient management.
7. Load-test member fan-out at 10 / 100 / 500 simulated configs before public launch.

## Rule when member conditions differ
Different conditions are expected and must not be reconciled or averaged.

Example:
- Member #0001: minute 70-85, Momentum >= 65, Odds >= 1.80
- Member #0002: minute 60-78, Momentum >= 58, Odds >= 1.70

The same shared match snapshot is evaluated twice. A match may trigger for #0001 and not #0002, or vice versa. This is correct behavior.
