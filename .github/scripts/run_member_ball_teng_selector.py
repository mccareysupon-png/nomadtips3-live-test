import json
import os
import runpy
import shutil
import tempfile
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER_BASE = os.environ.get(
    'MEMBER_WORKER_BASE',
    'https://nomadtips3-test-api.mccarey-supon.workers.dev',
).rstrip('/')
MEMBER_ID = str(os.environ.get('MEMBER_ID', '0001')).strip().zfill(4)
ENGINE_KEY = os.environ.get('API_FOOTBALL_KEY', '')
FORCE = os.environ.get('MEMBER_SELECTOR_FORCE', '0') == '1'
API_HOST = 'football.api-sports.io'

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
}

PIPELINE_SCRIPTS = [
    'auto_select_next.py',
    'run_ball_teng_selector.py',
    'apply_confidence_policy.py',
    'finalize_ball_teng_analysis.py',
    'enrich_selected_odds.py',
]


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def worker_json(path):
    request = urllib.request.Request(
        f'{WORKER_BASE}{path}',
        headers={'Accept': 'application/json', 'User-Agent': 'nomadtips3-member-ball-teng/1'},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    if not payload.get('ok'):
        raise RuntimeError(payload.get('error') or f'Worker request failed: {path}')
    return payload


def post_worker(path, payload):
    if not ENGINE_KEY:
        raise RuntimeError('API_FOOTBALL_KEY is required for authenticated member selector ingest')
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(
        f'{WORKER_BASE}{path}',
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'nomadtips3-member-ball-teng/1',
            'X-NOMAD-ENGINE-KEY': ENGINE_KEY,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result.get('ok'):
        raise RuntimeError(result.get('error') or 'Member Ball Teng ingest failed')
    return result


def active_rules():
    payload = worker_json(f'/member-ball-teng-config?member={MEMBER_ID}')
    active = payload.get('active') or {}
    version = int(payload.get('version') or 0)
    if not version:
        raise RuntimeError('Member Ball Teng active config version is missing')
    return active, version


def current_result():
    try:
        return worker_json(f'/member-ball-teng-results?member={MEMBER_ID}')
    except Exception:
        return {}


def build_rules(active):
    rules = read_json(REPO_ROOT / 'config/nomad-auto-rules.json', {})
    for source, target in FIELD_MAP.items():
        if source in active:
            rules[target] = active[source]
    rules['environment'] = 'MEMBER_TEST_ONLY'
    rules['fixed_confidence'] = int(rules.get('minimum_confidence', 58))
    nested = rules.setdefault('rules', {})
    nested['legacy_unranked_common_opponent'] = False
    nested['use_league_standings'] = bool(rules.get('use_standings_context', True))
    nested['member_isolated_selector'] = True
    nested['member_id'] = MEMBER_ID
    return rules


def selection_window_key(rules):
    zone = ZoneInfo(rules.get('timezone', 'Asia/Bangkok'))
    now_local = datetime.now(timezone.utc).astimezone(zone)
    cutoff = datetime.combine(
        now_local.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=zone,
    ).replace(hour=int(rules.get('cutoff_hour_local', 8)))
    return cutoff.isoformat()


def existing_identity(result):
    payload = result.get('payload') if isinstance(result, dict) else None
    payload = payload if isinstance(payload, dict) else {}
    member_meta = payload.get('memberSelection') or {}
    auto_meta = payload.get('autoSelection') or {}
    version = int(result.get('configVersion') or member_meta.get('configVersion') or 0)
    window_key = member_meta.get('windowKey') or auto_meta.get('windowKey')
    return version, window_key


def copy_pipeline(workdir):
    script_dir = workdir / '.github/scripts'
    script_dir.mkdir(parents=True, exist_ok=True)
    for name in PIPELINE_SCRIPTS:
        shutil.copy2(REPO_ROOT / '.github/scripts' / name, script_dir / name)


def run_pipeline(workdir, rules):
    copy_pipeline(workdir)
    write_json(workdir / 'config/nomad-auto-rules.json', rules)
    write_json(workdir / 'result-feed.json', {'summary': {'allSettled': True}})
    write_json(workdir / 'auto-selection-state.json', {})

    original_cwd = Path.cwd()
    original_urlopen = urllib.request.urlopen
    api_counter = {'count': 0}

    def counting_urlopen(request, *args, **kwargs):
        target = getattr(request, 'full_url', None) or str(request)
        if API_HOST in str(target):
            api_counter['count'] += 1
        return original_urlopen(request, *args, **kwargs)

    old_force_select = os.environ.get('FORCE_AUTO_SELECT')
    old_force_reselect = os.environ.get('FORCE_AUTO_RESELECT')
    os.environ['FORCE_AUTO_SELECT'] = '1'
    os.environ['FORCE_AUTO_RESELECT'] = '1'
    urllib.request.urlopen = counting_urlopen

    try:
        os.chdir(workdir)
        runpy.run_path('.github/scripts/run_ball_teng_selector.py', run_name='__main__')
        selected_path = Path('selected-live-matches.json')
        if selected_path.exists():
            runpy.run_path('.github/scripts/apply_confidence_policy.py', run_name='__main__')
            runpy.run_path('.github/scripts/finalize_ball_teng_analysis.py', run_name='__main__')
            selected = read_json(selected_path, {})
            if selected.get('matches'):
                runpy.run_path('.github/scripts/enrich_selected_odds.py', run_name='__main__')
    finally:
        urllib.request.urlopen = original_urlopen
        os.chdir(original_cwd)
        if old_force_select is None:
            os.environ.pop('FORCE_AUTO_SELECT', None)
        else:
            os.environ['FORCE_AUTO_SELECT'] = old_force_select
        if old_force_reselect is None:
            os.environ.pop('FORCE_AUTO_RESELECT', None)
        else:
            os.environ['FORCE_AUTO_RESELECT'] = old_force_reselect

    selected = read_json(workdir / 'selected-live-matches.json', {})
    report = read_json(workdir / 'auto-selection-report.json', {})
    return selected, report, api_counter['count']


def empty_payload(rules, window_key, status):
    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    return {
        'selection_date': datetime.now(ZoneInfo(rules.get('timezone', 'Asia/Bangkok'))).date().isoformat(),
        'locked_at_utc': now,
        'system': 'NOMAD MEMBER BALL TENG / ISOLATED TEST',
        'environment': 'MEMBER_TEST_ONLY',
        'rules': {'status': status},
        'matches': [],
        'autoSelection': {'windowKey': window_key, 'generatedAt': now},
    }


def main():
    if not ENGINE_KEY:
        raise RuntimeError('API_FOOTBALL_KEY is not configured')

    active, config_version = active_rules()
    rules = build_rules(active)
    window_key = selection_window_key(rules)
    existing = current_result()
    existing_version, existing_window = existing_identity(existing)

    if not FORCE and existing_version == config_version and existing_window == window_key:
        print(json.dumps({
            'status': 'MEMBER_SET_ALREADY_CURRENT',
            'memberId': MEMBER_ID,
            'configVersion': config_version,
            'windowKey': window_key,
        }, ensure_ascii=False))
        return

    if not bool(rules.get('enabled', True)):
        selected = empty_payload(rules, window_key, 'DISABLED_BY_MEMBER')
        report = {'status': 'DISABLED_BY_MEMBER', 'fixturesAnalyzed': 0}
        api_calls = 0
    else:
        with tempfile.TemporaryDirectory(prefix=f'nomad-member-{MEMBER_ID}-') as temp:
            selected, report, api_calls = run_pipeline(Path(temp), rules)
        if not selected:
            selected = empty_payload(rules, window_key, report.get('status') or 'NO_QUALIFYING_SELECTIONS')

    now_text = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    selected['system'] = 'NOMAD MEMBER BALL TENG / ISOLATED TEST'
    selected['environment'] = 'MEMBER_TEST_ONLY'
    selected['memberSelection'] = {
        'memberId': MEMBER_ID,
        'configVersion': config_version,
        'windowKey': window_key,
        'generatedAt': now_text,
        'independentFromOwner': True,
        'engine': 'copied NOMAD Ball Teng selector with member-only wiring',
    }
    selected.setdefault('autoSelection', {})['windowKey'] = window_key
    selected['autoSelection']['generatedAt'] = now_text

    safe_window = ''.join(ch if ch.isalnum() else '-' for ch in window_key).strip('-')
    set_id = f'{MEMBER_ID}:{config_version}:{safe_window}'[:150]
    result = post_worker('/member-ball-teng-ingest', {
        'memberId': MEMBER_ID,
        'setId': set_id,
        'configVersion': config_version,
        'generatedAt': now_text,
        'payload': selected,
        'report': report,
        'usage': {
            'apiFootballRequests': api_calls,
            'fixturesAnalyzed': int(report.get('fixturesAnalyzed') or 0),
        },
    })

    print(json.dumps({
        'status': 'MEMBER_SET_STORED',
        'memberId': MEMBER_ID,
        'configVersion': config_version,
        'windowKey': window_key,
        'matches': len(selected.get('matches') or []),
        'apiFootballRequests': api_calls,
        'workerResult': result,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
