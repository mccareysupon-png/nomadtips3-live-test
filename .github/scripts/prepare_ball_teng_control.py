import json
import os
import urllib.request
from pathlib import Path

RULES_PATH = Path('config/nomad-auto-rules.json')
STATE_PATH = Path('auto-selection-state.json')
CONTROL_URL = os.environ.get(
    'BALL_TENG_CONTROL_URL',
    'https://nomadtips3-test-api.mccarey-supon.workers.dev/ball-teng-config',
)

FIELD_MAP = {
    'enabled': 'enabled',
    'cutoffHourLocal': 'cutoff_hour_local',
    'minimumLeadMinutes': 'minimum_lead_minutes',
    'minimumConfidence': 'minimum_confidence',
    'maximumConfidence': 'maximum_confidence',
    'confidenceStrengthScale': 'confidence_strength_scale',
    'minimumMainOdds': 'minimum_main_odds',
    'overallSample': 'overall_sample',
    'venueSample': 'venue_sample',
    'historyFetch': 'history_fetch',
    'minimumSample': 'minimum_sample',
    'minimumStrengthScore': 'minimum_strength_score',
    'minimumOverallPpgEdge': 'minimum_overall_ppg_edge',
    'minimumVenuePpgEdge': 'minimum_venue_ppg_edge',
    'maximumFixturesToAnalyze': 'maximum_fixtures_to_analyze',
    'maximumSelections': 'maximum_selections',
    'overallPpgWeight': 'overall_ppg_weight',
    'venuePpgWeight': 'venue_ppg_weight',
    'goalDifferenceWeight': 'goal_difference_weight',
    'useStandingsContext': 'use_standings_context',
    'standingsStrengthWeight': 'standings_strength_weight',
    'standingsAdjustmentCap': 'standings_adjustment_cap',
    'standingsDirectRankMix': 'standings_direct_rank_mix',
    'standingsRankedCommonMix': 'standings_ranked_common_mix',
    'presetKey': 'preset_key',
    'addKTheKingOfSoccer': 'add_k_the_king_of_soccer',
    'requireStandingsContext': 'require_standings_context',
    'minimumLeagueTeamCount': 'minimum_league_team_count',
}


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def append_env(name, value):
    env_path = os.environ.get('GITHUB_ENV')
    if not env_path:
        return
    with open(env_path, 'a', encoding='utf-8') as handle:
        handle.write(f'{name}={value}\n')


def fetch_control():
    request = urllib.request.Request(
        CONTROL_URL,
        headers={
            'Accept': 'application/json',
            'User-Agent': 'nomadtips3-ball-teng-selector/2',
        },
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = json.load(response)
    if not payload.get('ok') or not isinstance(payload.get('active'), dict):
        raise RuntimeError(payload.get('error') or 'invalid ball-teng control payload')
    return payload


def main():
    rules = read_json(RULES_PATH)
    state = read_json(STATE_PATH)

    append_env('NOMAD_CONTROL_AVAILABLE', '0')
    append_env('NOMAD_CONTROL_VERSION', '0')
    append_env('NOMAD_CONTROL_CHANGED', '0')
    append_env('NOMAD_CONTROL_FORCE', '0')

    try:
        payload = fetch_control()
    except Exception as error:
        print(json.dumps({
            'status': 'CONTROL_UNAVAILABLE_REPO_DEFAULTS_USED',
            'url': CONTROL_URL,
            'error': str(error),
        }, ensure_ascii=False))
        return

    version = int(payload.get('version') or 0)
    active = payload.get('active') or {}
    for source_key, target_key in FIELD_MAP.items():
        if source_key in active:
            rules[target_key] = active[source_key]

    nested = rules.setdefault('rules', {})
    nested['legacy_unranked_common_opponent'] = False
    nested['use_league_standings'] = bool(rules.get('use_standings_context', True))
    nested['standings_policy'] = (
        'Use direct A-vs-B league rank and rank-weighted shared opponent C. '
        'The legacy unranked common-opponent term is retired.'
    )
    if rules.get('add_k_the_king_of_soccer'):
        nested['preset'] = 'Add K The King of Soccer'
        nested['data_quality_policy'] = (
            'Strict preset: require adequate recent samples and covered league standings; '
            'never fabricate unavailable odds or unsupported data.'
        )
    write_json(RULES_PATH, rules)

    previous = int(state.get('lastControlVersion') or 0)
    changed = version > 0 and version != previous
    # The first connection establishes a baseline without unexpectedly replacing
    # a locked set. Every later activated version is an explicit owner Run.
    force = version > 0 and previous > 0 and version > previous

    append_env('NOMAD_CONTROL_AVAILABLE', '1')
    append_env('NOMAD_CONTROL_VERSION', str(version))
    append_env('NOMAD_CONTROL_CHANGED', '1' if changed else '0')
    append_env('NOMAD_CONTROL_FORCE', '1' if force else '0')
    if force:
        append_env('FORCE_AUTO_SELECT', '1')
        append_env('FORCE_AUTO_RESELECT', '1')

    print(json.dumps({
        'status': 'CONTROL_APPLIED_TO_RUNTIME',
        'version': version,
        'previousVersion': previous,
        'changed': changed,
        'forceReselect': force,
        'source': CONTROL_URL,
        'presetKey': rules.get('preset_key'),
        'addKTheKingOfSoccer': bool(rules.get('add_k_the_king_of_soccer')),
        'minimumConfidence': rules.get('minimum_confidence'),
        'minimumMainOdds': rules.get('minimum_main_odds'),
        'minimumSample': rules.get('minimum_sample'),
        'requireStandingsContext': bool(rules.get('require_standings_context')),
        'standingsStrengthWeight': rules.get('standings_strength_weight'),
        'legacyCommonOpponentWeight': 0,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
