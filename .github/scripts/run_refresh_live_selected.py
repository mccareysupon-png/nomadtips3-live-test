from pathlib import Path
import json
import subprocess

SOURCE = Path('.github/scripts/refresh_live_selected.py')
RESULT_FEED = Path('result-feed.json')

OLD = '''current_map = {}
if selected_ids:
    rows = api("/fixtures", {"ids": "-".join(str(value) for value in sorted(selected_ids)), "timezone": "UTC"})
    current_map = {int((row.get("fixture") or {}).get("id")): row for row in rows}
'''

NEW = '''current_map = {}
if selected_ids:
    rows = []
    ordered_ids = sorted(selected_ids)
    batch_size = 20
    for offset in range(0, len(ordered_ids), batch_size):
        batch_ids = ordered_ids[offset:offset + batch_size]
        rows.extend(api("/fixtures", {"ids": "-".join(str(value) for value in batch_ids), "timezone": "UTC"}))
    current_map = {int((row.get("fixture") or {}).get("id")): row for row in rows}
'''

SETTLED_OUTCOMES = {'correct', 'incorrect', 'void'}
AH_OUTCOMES = {'win', 'half-win', 'push', 'half-loss', 'loss', 'void'}


def load_json_text(text):
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def read_json(path):
    try:
        return load_json_text(path.read_text(encoding='utf-8'))
    except Exception:
        return {}


def result_key(item):
    provider = str(item.get('providerFixtureId') or '').strip()
    fixture = str(item.get('fixtureId') or '').strip()
    return provider or fixture


def is_settled(item):
    return bool(item.get('resultConfirmed')) or str(item.get('outcome') or '').lower() in SETTLED_OUTCOMES


def recent_settled_history(max_commits=120):
    merged = {}

    def absorb(feed):
        for item in feed.get('results') or []:
            if not isinstance(item, dict) or not is_settled(item):
                continue
            key = result_key(item)
            if key and key not in merged:
                merged[key] = item

    absorb(read_json(RESULT_FEED))

    try:
        hashes = subprocess.check_output(
            ['git', 'log', f'--max-count={max_commits}', '--format=%H', '--', 'result-feed.json'],
            text=True,
        ).splitlines()
    except Exception:
        hashes = []

    for commit in hashes:
        try:
            raw = subprocess.check_output(
                ['git', 'show', f'{commit}:result-feed.json'],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            continue
        absorb(load_json_text(raw))

    return list(merged.values())


def standard_market_summary(results, key):
    markets = [item.get('markets', {}).get(key) for item in results if isinstance(item.get('markets', {}).get(key), dict)]
    correct = sum(str(m.get('outcome') or '').lower() == 'correct' for m in markets)
    incorrect = sum(str(m.get('outcome') or '').lower() == 'incorrect' for m in markets)
    void = sum(str(m.get('outcome') or '').lower() == 'void' for m in markets)
    pending = len(markets) - correct - incorrect - void
    settled = correct + incorrect
    return {
        'total': len(markets),
        'correct': correct,
        'incorrect': incorrect,
        'void': void,
        'pending': pending,
        'settled': settled,
        'accuracy': round((correct / settled) * 100, 2) if settled else 0.0,
    }


def asian_market_summary(results):
    counts = {'win': 0, 'half-win': 0, 'push': 0, 'half-loss': 0, 'loss': 0, 'void': 0, 'pending': 0}
    total = 0
    for item in results:
        market = item.get('markets', {}).get('asianHandicap')
        if not isinstance(market, dict):
            continue
        total += 1
        outcome = str(market.get('outcome') or market.get('settlement') or 'pending').lower()
        if outcome in AH_OUTCOMES:
            counts[outcome] += 1
        elif outcome == 'correct':
            counts['win'] += 1
        elif outcome == 'incorrect':
            counts['loss'] += 1
        else:
            counts['pending'] += 1
    decisions = counts['win'] + counts['half-win'] + counts['half-loss'] + counts['loss']
    weighted = ((counts['win'] + counts['half-win'] * 0.5) / decisions) * 100 if decisions else 0.0
    return {
        **counts,
        'total': total,
        'decisions': decisions,
        'weightedRate': round(weighted, 2),
    }


def cumulative_summary(results, generated_at):
    counted = [item for item in results if item.get('counted', True) is not False]
    correct = sum(str(item.get('outcome') or '').lower() == 'correct' for item in counted)
    incorrect = sum(str(item.get('outcome') or '').lower() == 'incorrect' for item in counted)
    void = sum(str(item.get('outcome') or '').lower() == 'void' for item in counted)
    pending = sum(str(item.get('outcome') or '').lower() not in SETTLED_OUTCOMES for item in counted)
    settled = correct + incorrect
    return {
        'total': len(counted),
        'correct': correct,
        'incorrect': incorrect,
        'void': void,
        'pending': pending,
        'settled': settled,
        'allSettled': pending == 0,
        'accuracy': round((correct / settled) * 100, 2) if settled else 0.0,
        'finalizedAt': generated_at if pending == 0 else None,
    }


def preserve_cumulative_results(history):
    feed = read_json(RESULT_FEED)
    current_results = [item for item in feed.get('results') or [] if isinstance(item, dict)]
    current_keys = {result_key(item) for item in current_results if result_key(item)}

    merged = {}
    for item in history:
        key = result_key(item)
        if key and key not in current_keys:
            merged[key] = item
    for item in current_results:
        key = result_key(item)
        if key:
            merged[key] = item

    results = list(merged.values())
    results.sort(key=lambda item: str(item.get('kickoffUtc') or ''))
    generated_at = feed.get('generatedAt')

    feed['currentBatchSummary'] = feed.get('summary') or {}
    feed['currentBatchMarketSummary'] = feed.get('marketSummary') or {}
    feed['summary'] = cumulative_summary(results, generated_at)
    feed['marketSummary'] = {
        'btts': standard_market_summary(results, 'btts'),
        'doubleChance': standard_market_summary(results, 'doubleChance'),
        'asianHandicap': asian_market_summary(results),
    }
    feed['results'] = results
    feed['historyMode'] = 'CUMULATIVE_CONFIRMED_PLUS_CURRENT'
    feed['historyCount'] = max(0, len(results) - len(current_results))

    RESULT_FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'event': 'cumulative_result_feed_preserved',
        'current': len(current_results),
        'history': feed['historyCount'],
        'total': len(results),
        'pending': feed['summary']['pending'],
    }))


history_before_refresh = recent_settled_history()
source = SOURCE.read_text(encoding='utf-8')
if OLD not in source:
    raise RuntimeError('Live refresh batch patch target not found; inspect refresh_live_selected.py before running.')

patched = source.replace(OLD, NEW, 1)
print('NOMAD live refresh: fixture ids will be requested in API batches of 20.')
exec(compile(patched, str(SOURCE), 'exec'), {'__name__': '__main__', '__file__': str(SOURCE)})
preserve_cumulative_results(history_before_refresh)
