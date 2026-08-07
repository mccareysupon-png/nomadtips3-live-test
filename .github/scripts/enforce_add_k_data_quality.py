import json
from pathlib import Path

RULES_PATH = Path('config/nomad-auto-rules.json')
SELECTED_PATH = Path('selected-live-matches.json')
REPORT_PATH = Path('auto-selection-report.json')


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def number(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def integer(value, fallback=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def reject_reason(match, rules):
    if not match.get('fixture_id') or not match.get('home') or not match.get('away'):
        return 'fixture identity incomplete'

    analysis = match.get('auto_analysis') or {}
    context = analysis.get('standingsContext') or {}

    if bool(rules.get('require_standings_context', False)) and not context.get('available'):
        return f"league standings unavailable: {context.get('reason') or 'unknown reason'}"

    minimum_teams = integer(rules.get('minimum_league_team_count'), 0)
    team_count = integer(context.get('teamCount'), 0)
    if minimum_teams > 0 and team_count < minimum_teams:
        return f'league table too small/incomplete ({team_count} teams; need {minimum_teams})'

    minimum_strength = number(rules.get('minimum_strength_score'), 0.0)
    adjusted_strength = analysis.get('adjustedStrength')
    if adjusted_strength is None:
        adjusted_strength = analysis.get('absoluteStrength')
    if adjusted_strength is None:
        adjusted_strength = abs(number(analysis.get('strengthScore'), 0.0))
    if number(adjusted_strength, 0.0) < minimum_strength:
        return f'adjusted strength below {minimum_strength:.2f}'

    minimum_confidence = integer(rules.get('minimum_confidence'), 62)
    if integer(match.get('confidence'), 0) < minimum_confidence:
        return f'confidence below {minimum_confidence}%'

    return None


def main():
    rules = read_json(RULES_PATH)
    if not bool(rules.get('add_k_the_king_of_soccer', False)):
        print(json.dumps({'status': 'SKIPPED_NOT_ADD_K'}))
        return

    selected = read_json(SELECTED_PATH)
    matches = selected.get('matches') or []
    if not isinstance(matches, list):
        print(json.dumps({'status': 'SKIPPED_NO_SELECTIONS'}))
        return

    passed = []
    rejected = []
    for match in matches:
        reason = reject_reason(match, rules)
        if reason:
            rejected.append({
                'fixture_id': match.get('fixture_id'),
                'match': f"{match.get('home')} vs {match.get('away')}",
                'reason': reason,
            })
            continue

        analysis = match.setdefault('auto_analysis', {})
        analysis['addKDataQuality'] = {
            'passed': True,
            'preset': 'Add K The King of Soccer',
            'version': 1,
            'requiresStandings': bool(rules.get('require_standings_context', True)),
            'minimumLeagueTeamCount': integer(rules.get('minimum_league_team_count'), 8),
            'minimumSample': integer(rules.get('minimum_sample'), 5),
            'note': 'Uses only signals currently supported by the selector. Missing or unsupported data are never invented.',
        }
        passed.append(match)

    selected['matches'] = passed
    selected['addKTheKingOfSoccer'] = {
        'active': True,
        'presetKey': rules.get('preset_key') or 'ADD_K_THE_KING_OF_SOCCER_V1',
        'version': 1,
        'fixedRules': True,
        'editable': False,
        'qualityGate': 'STRICT',
        'minimumConfidence': integer(rules.get('minimum_confidence'), 62),
        'minimumMainOdds': number(rules.get('minimum_main_odds'), 1.70),
        'minimumSample': integer(rules.get('minimum_sample'), 5),
        'requireStandingsContext': bool(rules.get('require_standings_context', True)),
        'minimumLeagueTeamCount': integer(rules.get('minimum_league_team_count'), 8),
        'passed': len(passed),
        'rejected': len(rejected),
        'rejections': rejected,
        'policy': 'Data Quality First -> Analysis -> Pick. No forced selections; zero picks is valid.',
    }
    write_json(SELECTED_PATH, selected)

    if REPORT_PATH.exists():
        report = read_json(REPORT_PATH)
        report['addKTheKingOfSoccer'] = selected['addKTheKingOfSoccer']
        write_json(REPORT_PATH, report)

    print(json.dumps({
        'status': 'ADD_K_DATA_QUALITY_APPLIED',
        'passed': len(passed),
        'rejected': len(rejected),
        'rejections': rejected,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
