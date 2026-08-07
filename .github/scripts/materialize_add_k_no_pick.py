import json
from pathlib import Path

RULES_PATH = Path('config/nomad-auto-rules.json')
SELECTED_PATH = Path('selected-live-matches.json')
REPORT_PATH = Path('auto-selection-report.json')


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    rules = read_json(RULES_PATH)
    if not rules.get('add_k_the_king_of_soccer'):
        print(json.dumps({'status': 'SKIPPED_NOT_ADD_K'}))
        return

    report = read_json(REPORT_PATH)
    if report.get('status') != 'NO_QUALIFYING_SELECTIONS_KEEPING_CURRENT_SET':
        print(json.dumps({'status': 'SKIPPED_SELECTOR_HAS_NEW_OUTCOME'}))
        return

    generated_at = report.get('generatedAt')
    rejection_counts = report.get('rejections') or {}
    meta = {
        'active': True,
        'presetKey': rules.get('preset_key') or 'ADD_K_THE_KING_OF_SOCCER_V1',
        'version': 1,
        'fixedRules': True,
        'editable': False,
        'qualityGate': 'STRICT',
        'minimumConfidence': int(rules.get('minimum_confidence', 62)),
        'minimumMainOdds': float(rules.get('minimum_main_odds', 1.70)),
        'minimumSample': int(rules.get('minimum_sample', 5)),
        'requireStandingsContext': bool(rules.get('require_standings_context', True)),
        'minimumLeagueTeamCount': int(rules.get('minimum_league_team_count', 8)),
        'passed': 0,
        'noPick': True,
        'reason': 'No fixture passed the fixed Add K screening rules.',
        'selectorRejections': rejection_counts,
        'policy': 'Data Quality First -> Analysis -> Pick. Zero selections is a valid result.',
    }

    payload = {
        'selection_date': (generated_at or '')[:10] or None,
        'locked_at_utc': generated_at,
        'window_end_local': report.get('windowEndLocal'),
        'system': 'NOMAD SYSTEM / BALL TENG AUTO TEST v.2 · ADD K THE KING OF SOCCER',
        'environment': 'TEST_ONLY',
        'rules': {
            'market': '1X2 team win',
            'automatic_selection': True,
            'preset': 'Add K The King of Soccer',
            'fixed_rules': True,
            'data_quality_first': True,
        },
        'matches': [],
        'noPick': True,
        'noPickReason': meta['reason'],
        'addKTheKingOfSoccer': meta,
        'autoSelection': {
            'windowKey': report.get('windowKey'),
            'windowStartLocal': report.get('windowStartLocal'),
            'windowEndLocal': report.get('windowEndLocal'),
            'generatedAt': generated_at,
            'report': 'auto-selection-report.json',
        },
    }
    write_json(SELECTED_PATH, payload)
    report['status'] = 'ADD_K_NO_PICK'
    report['published'] = 0
    report['addKTheKingOfSoccer'] = meta
    write_json(REPORT_PATH, report)
    print(json.dumps({'status': 'ADD_K_NO_PICK', 'published': 0}, ensure_ascii=False))


if __name__ == '__main__':
    main()
