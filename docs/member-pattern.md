# NOMADTIPS3 Member Pattern

Status: TEST PATTERN — start with Member #0001

## One member application, not one HTML file per member
The production pattern uses one member application/template. A successful signup provisions data, not a new webpage.

`/member/` -> authenticated session -> resolve member_id -> load that member's data only.

Member #0001 currently stays at `test-system/member-0001/` as the first isolated TEST profile. Once the pattern passes, the UI will be generalized into one `/member/` template.

## Provisioning pattern
After signup/approval:
1. Generate a unique `member_id`.
2. Create `member_profiles` with ACTIVE/PENDING status as appropriate.
3. Seed `member_live_config` once from the current System active live config.
4. Seed `member_ball_teng_config` once from the current System active Ball Teng config.
5. Create `member_notification_settings`.
6. Do not create personal result rows until that member's own engine produces results.
7. Future Owner/System config changes do not overwrite an existing member's active config.

## Per-member ownership boundary
All member-owned writes must include the resolved `member_id`:
- Live config: `member_live_config`
- Ball Teng config: `member_ball_teng_config`
- Live state: `member_live_state`
- Live signals: `member_live_signals`
- Ball Teng sets: `member_ball_teng_sets`
- Settled/pending prediction results: `member_prediction_results`
- Notification settings/logs: `member_notification_settings`, `member_notification_log`

No member page may silently fall back to Owner/System results when personal data is absent.

## Shared-data / independent-rules pattern
Provider requests are shared. Rules and outputs are not.

`API-FOOTBALL -> shared normalized snapshot/cache`

Then fan out:
- snapshot -> Member #0001 active live rules -> #0001 states/signals
- snapshot -> Member #0002 active live rules -> #0002 states/signals
- snapshot -> Member #0003 active live rules -> #0003 states/signals

For Ball Teng, shared fixture/form/standings/odds caches are reused, but each member's selector runs with that member's active config and writes a separate member set.

Different member conditions are expected to produce different outcomes. They must never be averaged, reconciled or forced to match Owner/System.

## Page pattern
The member application has one navigation set:
- ภาพรวม
- แดชบอร์ดบอลเต็ง
- แดชบอร์บอลสด
- สถิติของฉัน
- การแจ้งเตือนของฉัน
- ตั้งค่าของฉัน

`ตั้งค่าของฉัน` contains two independent areas:
- เงื่อนไขตรวจจับบอลสดของฉัน
- เงื่อนไขคัดบอลเต็งของฉัน

Both support Default -> Save Draft -> Activate/Run. Member Activate changes only that member's active version.

## Authentication pattern
TEST Member #0001 may temporarily use a fixed/query member id while the prototype is isolated.

Production must use:
`Login -> secure session -> Worker resolves member_id -> every read/write uses that member_id`

A browser-supplied member id must never authorize production access.

## Member #0001 test gates
Do not call the first member pattern complete until all gates pass:

1. UI: all six menus work on desktop and mobile; no duplicate navigation; no Owner control appears.
2. Profile: #0001 loads as one member profile with its own status.
3. Live config isolation: change #0001 minute/momentum/odds, Save and Activate; Owner `/condition-config` remains unchanged.
4. Ball Teng config isolation: change #0001 confidence/odds/weights, Save and Activate; Owner `/ball-teng-config` remains unchanged.
5. Refresh persistence: member draft/active values survive reload.
6. Empty-state correctness: before member engines produce results, dashboards show waiting/empty rather than Owner results.
7. Live engine: a shared snapshot is evaluated with #0001 active live config and writes only `member_live_state/member_live_signals` for #0001.
8. Ball Teng engine: #0001 selector writes only `member_ball_teng_sets` and `member_prediction_results` for #0001.
9. Stats: only #0001 result rows are counted.
10. Notifications: only #0001 events/recipient are used.
11. Isolation proof: create temporary TEST #0002 with deliberately different rules; #0001 values/results remain unchanged.
12. Owner regression: normal Owner/System scanner, Ball Teng selector, settlement and LINE flows continue unchanged.

## Current implementation stage
Member #0001 settings/storage/read isolation is being built in Draft PR #18. The next functional gates are the independent live evaluator and Ball Teng selector, followed by session authentication before real members.
