import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

RULES_PATH = Path('config/nomad-auto-rules.json')
SELECTED_PATH = Path('selected-live-matches.json')
REPORT_PATH = Path('auto-selection-report.json')
PREVIOUS_PATH = Path(os.environ.get('ADD_K_PREVIOUS_SELECTED_PATH', '/tmp/nomad-prev-selected.json'))


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def parse_iso(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def match_key(match):
    return str(
        match.get('fixture_id')
        or match.get('providerFixtureId')
        or match.get('client_fixture_id')
        or match.get('fixtureId')
        or match.get('slug')
        or ''
    )


def kickoff(match):
    return parse_iso(match.get('kickoff_utc') or match.get('kickoffUtc'))


def main():
    rules = read_json(RULES_PATH)
    if not bool(rules.get('add_k_the_king_of_soccer', False)):
        print(json.dumps({'status': 'SKIPPED_NOT_ADD_K'}))
        return

    current = read_json(SELECTED_PATH)
    previous = read_json(PREVIOUS_PATH)
    report = read_json(REPORT_PATH)
    current_matches = current.get('matches') if isinstance(current.get('matches'), list) else []
    previous_matches = previous.get('matches') if isinstance(previous.get('matches'), list) else []

    now = datetime.now(timezone.utc)
    window_end = parse_iso(
        (current.get('autoSelection') or {}).get('windowEndLocal')
        or current.get('window_end_local')
        or report.get('windowEndLocal')
    )
    cycle_start = (window_end - timedelta(days=1)).astimezone(timezone.utc) if window_end else now - timedelta(days=1)

    current_keys = {match_key(match) for match in current_matches if match_key(match)}
    preserved = []
    for match in previous_matches:
        key = match_key(match)
        start = kickoff(match)
        if not key or key in current_keys or not start:
            continue
        start_utc = start.astimezone(timezone.utc)
        # Preserve only matches from the current 24-hour NOMAD cycle that have
        # already reached kickoff. Future picks are intentionally replaceable.
        if not (cycle_start <= start_utc <= now):
            continue
        locked = dict(match)
        locked['selection_origin'] = 'LOCKED_STARTED_PREVIOUS_RUN'
        locked['locked_by_rerun_policy'] = True
        preserved.append(locked)
        current_keys.add(key)

    for match in current_matches:
        if isinstance(match, dict):
            match.setdefault('selection_origin', 'CURRENT_ADD_K_RUN')

    merged = preserved + current_matches
    merged.sort(key=lambda match: kickoff(match) or datetime.max.replace(tzinfo=timezone.utc))
    current['matches'] = merged
    current['addKRunMerge'] = {
        'policy': 'LOCK_STARTED_REPLACE_FUTURE_DEDUPLICATE',
        'cycleStartUtc': cycle_start.isoformat().replace('+00:00', 'Z'),
        'newSelectionCount': len(current_matches),
        'preservedStartedCount': len(preserved),
        'totalDisplayedCount': len(merged),
        'noPickForNewRun': bool(current.get('noPick')) or len(current_matches) == 0,
    }
    write_json(SELECTED_PATH, current)

    if REPORT_PATH.exists():
        report['addKRunMerge'] = current['addKRunMerge']
        write_json(REPORT_PATH, report)

    print(json.dumps({
        'status': 'ADD_K_LOCKED_STARTED_MERGED',
        'newSelections': len(current_matches),
        'preservedStarted': len(preserved),
        'totalDisplayed': len(merged),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
