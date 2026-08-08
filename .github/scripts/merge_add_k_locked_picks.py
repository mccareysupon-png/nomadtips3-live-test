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


def deduplicate(matches):
    unique = []
    seen = set()
    duplicate_count = 0
    for match in matches:
        if not isinstance(match, dict):
            continue
        key = match_key(match)
        if key and key in seen:
            duplicate_count += 1
            continue
        if key:
            seen.add(key)
        unique.append(match)
    return unique, duplicate_count


def main():
    rules = read_json(RULES_PATH)
    manual_add_k = bool(rules.get('add_k_the_king_of_soccer', False)) and os.environ.get('NOMAD_ADD_K_RUN') == '1'

    current = read_json(SELECTED_PATH)
    previous = read_json(PREVIOUS_PATH)
    report = read_json(REPORT_PATH)
    current_matches = current.get('matches') if isinstance(current.get('matches'), list) else []
    previous_matches = previous.get('matches') if isinstance(previous.get('matches'), list) else []

    current_matches, current_duplicates = deduplicate(current_matches)
    previous_matches, _ = deduplicate(previous_matches)

    if current == previous and current_duplicates == 0:
        print(json.dumps({'status': 'NO_SELECTION_CHANGE_TO_MERGE'}))
        return

    now = datetime.now(timezone.utc)
    window_end = parse_iso(
        (current.get('autoSelection') or {}).get('windowEndLocal')
        or current.get('window_end_local')
        or report.get('windowEndLocal')
        or (previous.get('autoSelection') or {}).get('windowEndLocal')
        or previous.get('window_end_local')
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
        if not (cycle_start <= start_utc <= now):
            continue
        locked = dict(match)
        locked['selection_origin'] = 'LOCKED_STARTED_PREVIOUS_RUN'
        locked['locked_by_rerun_policy'] = True
        preserved.append(locked)
        current_keys.add(key)

    current_origin = 'CURRENT_ADD_K_RUN' if manual_add_k else 'CURRENT_AUTO_RUN'
    for match in current_matches:
        match['selection_origin'] = current_origin
        match.pop('locked_by_rerun_policy', None)

    new_count = len(current_matches)
    merged = preserved + current_matches
    merged, merged_duplicates = deduplicate(merged)
    merged.sort(key=lambda match: kickoff(match) or datetime.max.replace(tzinfo=timezone.utc))
    current['matches'] = merged

    merge_meta = {
        'policy': 'LOCK_STARTED_LATEST_FUTURE_WINS_DEDUPLICATE_BY_FIXTURE_ID',
        'cycleStartUtc': cycle_start.isoformat().replace('+00:00', 'Z'),
        'runType': 'MANUAL_ADD_K' if manual_add_k else 'AUTO',
        'newSelectionCount': new_count,
        'preservedStartedCount': len(preserved),
        'duplicatesRemoved': current_duplicates + merged_duplicates,
        'totalDisplayedCount': len(merged),
    }
    current['selectionMerge'] = merge_meta

    if manual_add_k:
        if new_count == 0:
            current['noPick'] = True
            current['noPickReason'] = current.get('noPickReason') or 'No new fixture passed the Add K fixed rules in this rerun.'
        else:
            current['noPick'] = False
            current.pop('noPickReason', None)
        current['addKRunMerge'] = {
            **merge_meta,
            'noPickForNewRun': new_count == 0,
        }

    write_json(SELECTED_PATH, current)

    if REPORT_PATH.exists():
        report['selectionMerge'] = merge_meta
        if manual_add_k:
            if new_count == 0:
                report['status'] = 'ADD_K_NO_PICK'
                report['published'] = 0
            report['addKRunMerge'] = current['addKRunMerge']
        write_json(REPORT_PATH, report)

    print(json.dumps({
        'status': 'SELECTIONS_MERGED',
        'runType': merge_meta['runType'],
        'newSelections': new_count,
        'preservedStarted': len(preserved),
        'duplicatesRemoved': merge_meta['duplicatesRemoved'],
        'totalDisplayed': len(merged),
        'noPick': bool(current.get('noPick')) if manual_add_k else False,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
