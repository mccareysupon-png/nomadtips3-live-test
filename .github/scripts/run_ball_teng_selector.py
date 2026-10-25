import json
import os
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path('.github/scripts/auto_select_next.py')
STATE_PATH = Path('auto-selection-state.json')
REPORT_PATH = Path('auto-selection-report.json')

AUTO_CLOCK_KEYS = (
    'lastAttemptAt',
    'lastAttemptWindowKey',
    'lastAttemptStatus',
    'lastSuccessfulAt',
    'lastSuccessfulWindowKey',
    'lastPublishedCount',
    'lastSelectionDate',
)

OLD_SCORE = '''    common_edge, common_count = common_opponent_edge(home_overall, away_overall)\n    score = (\n        (home_overall["ppg"] - away_overall["ppg"]) * 0.34\n        + (home_venue["ppg"] - away_venue["ppg"]) * 0.36\n        + (home_overall["gdpg"] - away_overall["gdpg"]) * 0.18\n        + common_edge * 0.12\n    )\n'''

NEW_SCORE = '''    # BALL TENG v2: the legacy unranked common-opponent 12% term is retired.\n    # Ranked A-B-C / league-standing context is applied after prequalification by\n    # apply_confidence_policy.py, using the dedicated standings weight from config.\n    score = (\n        (home_overall["ppg"] - away_overall["ppg"]) * float(rules.get("overall_ppg_weight", 0.34))\n        + (home_venue["ppg"] - away_venue["ppg"]) * float(rules.get("venue_ppg_weight", 0.36))\n        + (home_overall["gdpg"] - away_overall["gdpg"]) * float(rules.get("goal_difference_weight", 0.18))\n    )\n    common_edge, common_count = 0.0, 0\n'''

OLD_SETTLEMENT_GUARD = '''    if os.environ.get("FORCE_AUTO_SELECT") != "1" and not (result_feed.get("summary") or {}).get("allSettled", False):\n        report["status"] = "WAITING_FOR_CURRENT_SET_TO_SETTLE"\n        write_json(REPORT_PATH, report)\n        return\n'''

NEW_SETTLEMENT_GUARD = '''    completed_set_key = None\n    if os.environ.get("FORCE_AUTO_SELECT") != "1":\n        current_set = read_json(SELECTED_PATH)\n        current_ids = {str(item.get("fixture_id") or item.get("providerFixtureId") or item.get("fixtureId")) for item in current_set.get("matches") or [] if item.get("fixture_id") or item.get("providerFixtureId") or item.get("fixtureId")}\n        current_summary = result_feed.get("currentBatchSummary") or result_feed.get("summary") or {}\n        results = result_feed.get("results") or []\n        result_ids = {str(item.get("providerFixtureId") or item.get("fixtureId")) for item in results if item.get("providerFixtureId") or item.get("fixtureId")}\n        every_result_recorded = bool(current_ids) and current_ids.issubset(result_ids)\n        every_result_settled = all(item.get("resultConfirmed") or item.get("autoVoid") for item in results if str(item.get("providerFixtureId") or item.get("fixtureId")) in current_ids)\n        statistics_finalized = bool(current_summary.get("allSettled")) and bool(current_summary.get("finalizedAt"))\n        if not (every_result_recorded and every_result_settled and statistics_finalized):\n            report["status"] = "WAITING_FOR_LAST_MATCH_AND_FINAL_STATISTICS"\n            report["settlementGate"] = {"currentSelectionCount": len(current_ids), "recordedResultCount": len(current_ids & result_ids), "allSettled": bool(current_summary.get("allSettled")), "statisticsFinalizedAt": current_summary.get("finalizedAt")}\n            write_json(REPORT_PATH, report)\n            return\n        completed_set_key = str(current_summary.get("finalizedAt")) + ":" + ",".join(sorted(current_ids))\n        report["rolloverPolicy"] = "ALL_CURRENT_PICKS_SETTLED_AND_STATISTICS_FINALIZED"\n'''

OLD_WINDOW_GUARD = '''    if state.get("lastSuccessfulWindowKey") == window_key:\n        report["status"] = "ALREADY_SELECTED_FOR_WINDOW"\n'''

NEW_WINDOW_GUARD = '''    if os.environ.get("FORCE_AUTO_RESELECT") != "1" and completed_set_key and state.get("lastCompletedSetKey") == completed_set_key:\n        report["status"] = "COMPLETED_SET_ALREADY_CONSUMED"\n'''

OLD_NO_PICK_STATE = '''        state.update({"lastAttemptAt": now_text, "lastAttemptWindowKey": window_key, "lastAttemptStatus": report["status"], "lastPublishedCount": 0})\n'''
NEW_NO_PICK_STATE = '''        state.update({"lastAttemptAt": now_text, "lastAttemptWindowKey": window_key, "lastAttemptStatus": report["status"], "lastPublishedCount": 0, "lastCompletedSetKey": completed_set_key})\n'''

OLD_SUCCESS_STATE = '''        "lastSelectionDate": selection_date,\n    })\n'''
NEW_SUCCESS_STATE = '''        "lastSelectionDate": selection_date,\n        "lastCompletedSetKey": completed_set_key,\n    })\n'''


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def snapshot_auto_clock(state):
    return {key: state[key] for key in AUTO_CLOCK_KEYS if key in state}


def restore_auto_clock(after, before):
    for key in AUTO_CLOCK_KEYS:
        if key in before:
            after[key] = before[key]
        else:
            after.pop(key, None)


source = SOURCE.read_text(encoding='utf-8')
if OLD_SCORE not in source:
    raise RuntimeError('BALL TENG selector score patch target not found; inspect auto_select_next.py before running.')
if OLD_SETTLEMENT_GUARD not in source:
    raise RuntimeError('BALL TENG settlement gate patch target not found; inspect auto_select_next.py before running.')
if OLD_WINDOW_GUARD not in source:
    raise RuntimeError('BALL TENG selector window guard patch target not found; inspect auto_select_next.py before running.')
if OLD_NO_PICK_STATE not in source:
    raise RuntimeError('BALL TENG no-pick state patch target not found; inspect auto_select_next.py before running.')
if OLD_SUCCESS_STATE not in source:
    raise RuntimeError('BALL TENG success state patch target not found; inspect auto_select_next.py before running.')

patched = source.replace(OLD_SCORE, NEW_SCORE, 1)
patched = patched.replace(OLD_SETTLEMENT_GUARD, NEW_SETTLEMENT_GUARD, 1)
patched = patched.replace(OLD_WINDOW_GUARD, NEW_WINDOW_GUARD, 1)
patched = patched.replace(OLD_NO_PICK_STATE, NEW_NO_PICK_STATE, 1)
patched = patched.replace(OLD_SUCCESS_STATE, NEW_SUCCESS_STATE, 1)

manual_add_k = os.environ.get('NOMAD_ADD_K_RUN') == '1'
before_state = read_json(STATE_PATH)
before_auto_clock = snapshot_auto_clock(before_state) if manual_add_k else {}

print('NOMAD BALL TENG: legacy unranked common-opponent 12% term disabled; ranked standings context will replace it.')
print('NOMAD BALL TENG: next AUTO set waits for the last current pick and finalized current-batch statistics.')
if manual_add_k:
    print('NOMAD BALL TENG: manual Add K run is isolated from the AUTO schedule clock.')
elif os.environ.get('FORCE_AUTO_RESELECT') == '1':
    print('NOMAD BALL TENG: AUTO custom run requested; current selection window may be regenerated once.')

exec(compile(patched, str(SOURCE), 'exec'), {'__name__': '__main__', '__file__': str(SOURCE)})

if manual_add_k:
    after_state = read_json(STATE_PATH)
    report = read_json(REPORT_PATH)
    manual_status = str(report.get('status') or 'UNKNOWN')
    manual_published = int(report.get('published') or 0)
    manual_window = report.get('windowKey')
    restore_auto_clock(after_state, before_auto_clock)
    after_state['lastManualAttemptAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    after_state['lastManualWindowKey'] = manual_window
    after_state['lastManualAttemptStatus'] = manual_status
    after_state['lastManualPublishedCount'] = manual_published
    write_json(STATE_PATH, after_state)
    print(json.dumps({
        'status': 'MANUAL_ADD_K_AUTO_CLOCK_RESTORED',
        'manualStatus': manual_status,
        'manualPublished': manual_published,
        'manualWindowKey': manual_window,
        'autoSchedulePreserved': True,
    }, ensure_ascii=False))
