import json
import os
from datetime import datetime, timezone
from pathlib import Path

STATE_PATH = Path('auto-selection-state.json')


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


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
    if previous == version:
        print(json.dumps({'status': 'CONTROL_VERSION_ALREADY_RECORDED', 'version': version}))
        return

    state['lastControlVersion'] = version
    state['lastControlConsumedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    state['lastControlAction'] = 'RUN_RESELECT' if os.environ.get('NOMAD_CONTROL_FORCE') == '1' else 'BASELINE_SYNC'
    write_json(STATE_PATH, state)

    print(json.dumps({
        'status': 'CONTROL_VERSION_RECORDED',
        'previousVersion': previous,
        'version': version,
        'action': state['lastControlAction'],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
