import json
import os
import time
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
    last_error = None
    for attempt in range(3):
        separator = '&' if '?' in CONTROL_URL else '?'
        url = f'{CONTROL_URL}{separator}ts={time.time_ns()}'
        request = urllib.request.Request(
            url,
            headers={
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, max-age=0',
                'Pragma': 'no-cache',
                'User-Agent': 'nomadtips3-ball-teng-selector/5',
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                payload = json.load(response)
            if not payload.get('ok') or not isinstance(payload.get('active'), dict):
                raise RuntimeError(payload.get('error') or 'invalid ball-teng control payload')
            return payload
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(attempt + 1)
    raise last_error or RuntimeError('ball-teng control fetch failed')


def post_control(action, version, **extra):
    payload = {'action': action, 'version': int(version), **extra}
    request = urllib.request.Request(
        CONTROL_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'nomadtips3-ball-teng-selector/5',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        result = json.load(response)
    if not result.get('ok'):
        raise RuntimeError(result.get('error') or f'{action} failed')
    return result


def apply_config(rules, config):
    if not isinstance(config, dict):
        return
    for source_key, target_key in FIELD_MAP.items():
        if source_key in config:
            rules[target_key] = config[source_key]


def decorate_runtime_rules(rules, add_k):
    nested = rules.setdefault('rules', {})
    nested['legacy_unranked_common_opponent'] = False
    nested['use_league_standings'] = bool(rules.get('use_standings_context', True))
    nested['standings_policy'] = (
        'Use direct A-vs-B league rank and rank-weighted shared opponent C. '
        'The legacy unranked common-opponent term is retired.'
    )
    if add_k:
        nested['preset'] = 'Add K The King of Soccer'
        nested['data_quality_policy'] = (
            'Strict preset: require adequate recent samples and covered league standings; '
            'never fabricate unavailable odds or unsupported data.'
        )
    else:
        nested.pop('preset', None)
        nested.pop('data_quality_policy', None)


def main():
    rules = read_json(RULES_PATH)
    state = read_json(STATE_PATH)

    append_env('NOMAD_CONTROL_AVAILABLE', '0')
    append_env('NOMAD_CONTROL_VERSION', '0')
    append_env('NOMAD_CONTROL_CHANGED', '0')
    append_env('NOMAD_CONTROL_FORCE', '0')
    append_env('NOMAD_ADD_K_RUN', '0')
    append_env('NOMAD_SELECTOR_MODE', 'AUTO_SCHEDULE')

    try:
        payload = fetch_control()
    except Exception as error:
        decorate_runtime_rules(rules, False)
        write_json(RULES_PATH, rules)
        print(json.dumps({
            'status': 'CONTROL_UNAVAILABLE_REPO_AUTO_USED',
            'url': CONTROL_URL,
            'error': str(error),
        }, ensure_ascii=False))
        return

    active = payload.get('active') or {}
    presets = payload.get('presets') if isinstance(payload.get('presets'), dict) else {}
    add_k_preset = presets.get('addKTheKingOfSoccer') if isinstance(presets.get('addKTheKingOfSoccer'), dict) else {}
    run_state = payload.get('addKRun') if isinstance(payload.get('addKRun'), dict) else {}
    run_status = str(run_state.get('status') or 'READY').upper()
    run_version = int(run_state.get('version') or 0)
    run_pending = run_status in {'QUEUED', 'ANALYZING'}
    last_add_k_version = int(state.get('lastAddKVersion') or 0)
    manual_add_k = run_pending and run_version > 0 and run_version != last_add_k_version

    if manual_add_k:
        runtime_config = add_k_preset or active
        apply_config(rules, runtime_config)
        rules['add_k_the_king_of_soccer'] = True
        rules['preset_key'] = 'ADD_K_THE_KING_OF_SOCCER_V1'
        decorate_runtime_rules(rules, True)
        write_json(RULES_PATH, rules)

        append_env('NOMAD_CONTROL_AVAILABLE', '1')
        append_env('NOMAD_CONTROL_VERSION', str(run_version))
        append_env('NOMAD_CONTROL_CHANGED', '1')
        append_env('NOMAD_CONTROL_FORCE', '1')
        append_env('NOMAD_ADD_K_RUN', '1')
        append_env('NOMAD_SELECTOR_MODE', 'MANUAL_ADD_K')
        append_env('FORCE_AUTO_SELECT', '1')
        append_env('FORCE_AUTO_RESELECT', '1')

        run_state_update = None
        if run_status == 'QUEUED':
            try:
                run_state_update = post_control(
                    'mark-add-k-analyzing',
                    run_version,
                    message='Scheduler accepted this Add K run and started analysis without changing the AUTO schedule.'
                ).get('addKRun')
            except Exception as error:
                print(json.dumps({
                    'status': 'ADD_K_RUN_STATE_WARNING',
                    'version': run_version,
                    'error': str(error),
                }, ensure_ascii=False))

        print(json.dumps({
            'status': 'MANUAL_ADD_K_APPLIED_TO_RUNTIME',
            'mode': 'MANUAL_ADD_K',
            'version': run_version,
            'previousAddKVersion': last_add_k_version,
            'addKRunStatus': run_status,
            'addKRunState': run_state_update,
            'autoSchedulePreserved': True,
            'minimumConfidence': rules.get('minimum_confidence'),
            'minimumMainOdds': rules.get('minimum_main_odds'),
            'minimumSample': rules.get('minimum_sample'),
            'requireStandingsContext': bool(rules.get('require_standings_context')),
        }, ensure_ascii=False))
        return

    active_is_add_k = bool(active.get('addKTheKingOfSoccer')) or str(active.get('presetKey') or '') == 'ADD_K_THE_KING_OF_SOCCER_V1'
    if active_is_add_k:
        rules['add_k_the_king_of_soccer'] = False
        rules['preset_key'] = None
        decorate_runtime_rules(rules, False)
        write_json(RULES_PATH, rules)
        print(json.dumps({
            'status': 'AUTO_REPO_RULES_PRESERVED_AFTER_ADD_K',
            'mode': 'AUTO_SCHEDULE',
            'addKRunStatus': run_status,
            'lastAddKVersion': last_add_k_version,
            'autoSchedulePreserved': True,
            'minimumConfidence': rules.get('minimum_confidence'),
            'minimumMainOdds': rules.get('minimum_main_odds'),
        }, ensure_ascii=False))
        return

    version = int(payload.get('version') or 0)
    apply_config(rules, active)
    rules['add_k_the_king_of_soccer'] = False
    decorate_runtime_rules(rules, False)
    write_json(RULES_PATH, rules)

    previous = int(state.get('lastControlVersion') or 0)
    changed = version > 0 and version != previous
    force = version > 0 and previous > 0 and version > previous

    append_env('NOMAD_CONTROL_AVAILABLE', '1')
    append_env('NOMAD_CONTROL_VERSION', str(version))
    append_env('NOMAD_CONTROL_CHANGED', '1' if changed else '0')
    append_env('NOMAD_CONTROL_FORCE', '1' if force else '0')
    append_env('NOMAD_SELECTOR_MODE', 'AUTO_CUSTOM' if changed else 'AUTO_SCHEDULE')
    if force:
        append_env('FORCE_AUTO_SELECT', '1')
        append_env('FORCE_AUTO_RESELECT', '1')

    print(json.dumps({
        'status': 'AUTO_CONTROL_APPLIED_TO_RUNTIME',
        'mode': 'AUTO_CUSTOM' if changed else 'AUTO_SCHEDULE',
        'version': version,
        'previousVersion': previous,
        'changed': changed,
        'forceReselect': force,
        'source': CONTROL_URL,
        'autoSchedulePreserved': True,
        'minimumConfidence': rules.get('minimum_confidence'),
        'minimumMainOdds': rules.get('minimum_main_odds'),
        'minimumSample': rules.get('minimum_sample'),
        'standingsStrengthWeight': rules.get('standings_strength_weight'),
        'legacyCommonOpponentWeight': 0,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
