import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path('auto-selection-state.json')
SELECTED_PATH = Path('selected-live-matches.json')
REPORT_PATH = Path('auto-selection-report.json')
CONTROL_URL = os.environ.get(
    'BALL_TENG_CONTROL_URL',
    'https://nomadtips3-test-api.mccarey-supon.workers.dev/ball-teng-config',
)


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def post_control(action, version, **extra):
    payload = {'action': action, 'version': int(version), **extra}
    request = urllib.request.Request(
        CONTROL_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'nomadtips3-ball-teng-selector/3',
        },
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        result = json.load(response)
    if not result.get('ok'):
        raise RuntimeError(result.get('error') or f'{action} failed')
    return result


def stamp_add_k_completion(version):
    selected = read_json(SELECTED_PATH)
    report = read_json(REPORT_PATH)
    merge = selected.get('addKRunMerge') if isinstance(selected.get('addKRunMerge'), dict) else {}
    matches = selected.get('matches') if isinstance(selected.get('matches'), list) else []
    new_count = int(merge.get('newSelectionCount', len(matches)) or 0)
    preserved_count = int(merge.get('preservedStartedCount', 0) or 0)
    no_pick = bool(selected.get('noPick')) or new_count == 0
    outcome = 'NO_PICK' if no_pick else 'PICKS'
    completed_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    selected['controlVersion'] = int(version)
    selected['runStatus'] = 'COMPLETE'
    selected['runOutcome'] = outcome
    selected['runSelectionCount'] = new_count
    selected['runCompletedAt'] = completed_at
    add_k = selected.setdefault('addKTheKingOfSoccer', {})
    add_k['runVersion'] = int(version)
    add_k['runStatus'] = 'COMPLETE'
    add_k['runOutcome'] = outcome
    add_k['newSelectionCount'] = new_count
    add_k['preservedStartedCount'] = preserved_count
    add_k['totalDisplayedCount'] = len(matches)
    add_k['completedAt'] = completed_at
    write_json(SELECTED_PATH, selected)

    report['controlVersion'] = int(version)
    report['runStatus'] = 'COMPLETE'
    report['runOutcome'] = outcome
    report['runSelectionCount'] = new_count
    report['runCompletedAt'] = completed_at
    write_json(REPORT_PATH, report)

    message = (
        f'Add K completed: {new_count} new pick(s), {preserved_count} already-started pick(s) preserved.'
        if new_count > 0
        else f'Add K completed with NO PICK; {preserved_count} already-started pick(s) preserved.'
    )
    try:
        response = post_control(
            'mark-add-k-complete',
            version,
            outcome=outcome,
            selectionCount=new_count,
            message=message,
        )
        run_state = response.get('addKRun')
    except Exception as error:
        run_state = None
        print(json.dumps({
            'status': 'ADD_K_COMPLETE_STATE_WARNING',
            'version': version,
            'error': str(error),
        }, ensure_ascii=False))

    return {
        'outcome': outcome,
        'newSelectionCount': new_count,
        'preservedStartedCount': preserved_count,
        'totalDisplayedCount': len(matches),
        'completedAt': completed_at,
        'workerRunState': run_state,
    }


def main():
    if os.environ.get('NOMAD_CONTROL_AVAILABLE') != '1':
        print(json.dumps({'status': 'CONTROL_NOT_AVAILABLE'}))
        return

    version = int(os.environ.get('NOMAD_CONTROL_VERSION') or 0)
    if version <= 0:
        print(json.dumps({'status': 'CONTROL_VERSION_MISSING'}))
        return

    state = read_json(STATE_PATH)
    previous = int(state.get('lastControlVersion') or 0)
    add_k_run = os.environ.get('NOMAD_ADD_K_RUN') == '1'
    force = os.environ.get('NOMAD_CONTROL_FORCE') == '1'

    completion = None
    if add_k_run and force:
        completion = stamp_add_k_completion(version)

    if previous != version:
        state['lastControlVersion'] = version
        state['lastControlConsumedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        state['lastControlAction'] = 'RUN_RESELECT' if force else 'BASELINE_SYNC'
        if completion:
            state['lastAddKRun'] = {
                'version': version,
                **completion,
            }
        write_json(STATE_PATH, state)

    print(json.dumps({
        'status': 'CONTROL_VERSION_RECORDED' if previous != version else 'CONTROL_VERSION_ALREADY_RECORDED',
        'previousVersion': previous,
        'version': version,
        'action': 'RUN_RESELECT' if force else 'BASELINE_SYNC',
        'addKCompletion': completion,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
