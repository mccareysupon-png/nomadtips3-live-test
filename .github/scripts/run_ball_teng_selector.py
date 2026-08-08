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

OLD_WINDOW_GUARD = '''    if state.get("lastSuccessfulWindowKey") == window_key:\n        report["status"] = "ALREADY_SELECTED_FOR_WINDOW"\n'''

NEW_WINDOW_GUARD = '''    if os.environ.get("FORCE_AUTO_RESELECT") != "1" and state.get("lastSuccessfulWindowKey") == window_key:\n        report["status"] = "ALREADY_SELECTED_FOR_WINDOW"\n'''


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
if OLD_WINDOW_GUARD not in source:
    raise RuntimeError('BALL TENG selector window guard patch target not found; inspect auto_select_next.py before running.')

patched = source.replace(OLD_SCORE, NEW_SCORE, 1)
patched = patched.replace(OLD_WINDOW_GUARD, NEW_WINDOW_GUARD, 1)

manual_add_k = os.environ.get('NOMAD_ADD_K_RUN') == '1'
before_state = read_json(STATE_PATH)
before_auto_clock = snapshot_auto_clock(before_state) if manual_add_k else {}

print('NOMAD BALL TENG: legacy unranked common-opponent 12% term disabled; ranked standings context will replace it.')
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
