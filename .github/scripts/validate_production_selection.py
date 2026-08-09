import argparse
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


MINIMUM_MAIN_ODDS = 1.70
MINIMUM_CONFIDENCE = 58
DEFAULT_SELECTED_PATH = Path('selected-live-matches.json')
DEFAULT_ARCHIVE_DIR = Path('archive/rejected-production')


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as error:
        return {'_readError': str(error)}


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def inspect(payload):
    errors = []
    rules = payload.get('rules') if isinstance(payload.get('rules'), dict) else {}
    matches = payload.get('matches') if isinstance(payload.get('matches'), list) else None

    if payload.get('_readError'):
        errors.append(f"selection file unreadable: {payload['_readError']}")
        return errors
    if payload.get('recoveryRequired'):
        errors.append('automatic recovery explicitly requested')
    if payload.get('environment') != 'PRODUCTION':
        errors.append(f"environment must be PRODUCTION, got {payload.get('environment')!r}")
    if rules.get('automatic_selection') is not True:
        errors.append('automatic_selection must be true')
    if rules.get('manual_analysis_only') is True:
        errors.append('manual_analysis_only must be false')
    if number(rules.get('odds_min'), 0.0) < MINIMUM_MAIN_ODDS:
        errors.append(f'odds_min must be at least {MINIMUM_MAIN_ODDS:.2f}')
    if number(rules.get('confidence_minimum'), 0.0) < MINIMUM_CONFIDENCE:
        errors.append(f'confidence_minimum must be at least {MINIMUM_CONFIDENCE}%')
    if matches is None:
        errors.append('matches must be an array')
        return errors
    if not matches and not payload.get('noPick'):
        errors.append('an empty Production set must be an explicit NO PICK')

    for match in matches:
        fixture_id = match.get('fixture_id') or match.get('providerFixtureId') or match.get('fixtureId')
        origin = str(match.get('selection_origin') or '').upper()
        client_id = str(match.get('client_fixture_id') or '').upper()
        odds = number(match.get('odds'), 0.0)
        confidence = number(match.get('confidence'), 0.0)
        if origin.startswith('MANUAL') or client_id.startswith('MANUAL-'):
            errors.append(f'fixture {fixture_id}: Manual selection is forbidden in Machine 1 AUTO')
        if odds < MINIMUM_MAIN_ODDS:
            errors.append(f'fixture {fixture_id}: odds {odds:g} below {MINIMUM_MAIN_ODDS:.2f}')
        if confidence < MINIMUM_CONFIDENCE:
            errors.append(f'fixture {fixture_id}: confidence {confidence:g} below {MINIMUM_CONFIDENCE}%')
    return errors


def append_env(name, value):
    env_path = os.environ.get('GITHUB_ENV')
    if not env_path:
        return
    with open(env_path, 'a', encoding='utf-8') as handle:
        handle.write(f'{name}={value}\n')


def archive_invalid(path, archive_dir):
    if not path.exists():
        return None
    archive_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = archive_dir / f'{timestamp}-{path.name}'
    shutil.copyfile(path, target)
    return str(target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-recovery', action='store_true')
    parser.add_argument('--selected', type=Path, default=DEFAULT_SELECTED_PATH)
    parser.add_argument('--archive-dir', type=Path, default=DEFAULT_ARCHIVE_DIR)
    args = parser.parse_args()

    payload = read_json(args.selected)
    errors = inspect(payload)
    result = {
        'status': 'VALID_PRODUCTION_AUTO' if not errors else 'INVALID_PRODUCTION_SELECTION',
        'selectedPath': str(args.selected),
        'minimumMainOdds': MINIMUM_MAIN_ODDS,
        'minimumConfidence': MINIMUM_CONFIDENCE,
        'errors': errors,
    }

    if errors and args.prepare_recovery:
        result['quarantinedAs'] = (
            payload.get('quarantinedSet')
            if payload.get('recoveryRequired') and payload.get('quarantinedSet')
            else archive_invalid(args.selected, args.archive_dir)
        )
        append_env('FORCE_AUTO_SELECT', '1')
        append_env('FORCE_AUTO_RESELECT', '1')
        append_env('NOMAD_PRODUCTION_RECOVERY', '1')
        result['status'] = 'RECOVERY_REQUIRED'
        print(json.dumps(result, ensure_ascii=False))
        return

    print(json.dumps(result, ensure_ascii=False))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
