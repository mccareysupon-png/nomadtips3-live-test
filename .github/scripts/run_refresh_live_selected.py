from pathlib import Path
import json
import math
import subprocess

SOURCE = Path('.github/scripts/refresh_live_selected.py')
RESULT_FEED = Path('result-feed.json')
SELECTION = Path('selected-live-matches.json')

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
COUNTED_OUTCOMES = {'correct', 'incorrect'}
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


def git_json(commit, path):
    try:
        raw = subprocess.check_output(
            ['git', 'show', f'{commit}:{path}'],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return {}
    return load_json_text(raw)


def result_key(item):
    provider = str(item.get('providerFixtureId') or '').strip()
    fixture = str(item.get('fixtureId') or '').strip()
    return provider or fixture


def is_settled(item):
    return bool(item.get('resultConfirmed')) or str(item.get('outcome') or '').lower() in SETTLED_OUTCOMES


def selection_index(config):
    output = {}
    for selected in config.get('matches') or []:
        if not isinstance(selected, dict):
            continue
        keys = {
            str(selected.get('fixture_id') or '').strip(),
            str(selected.get('client_fixture_id') or '').strip(),
            str(selected.get('slug') or '').strip(),
        }
        for key in keys:
            if key:
                output[key] = selected
    return output


def find_selected(item, config):
    index = selection_index(config)
    keys = [
        str(item.get('providerFixtureId') or '').strip(),
        str(item.get('fixtureId') or '').strip(),
        str(item.get('slug') or '').strip(),
    ]
    for key in keys:
        if key and key in index:
            return index[key]
    return None


def number_or_none(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def enrich_result(item, feed=None, config=None):
    feed = feed if isinstance(feed, dict) else {}
    config = config if isinstance(config, dict) else {}
    result = dict(item) if isinstance(item, dict) else {}
    selected = find_selected(result, config)

    selection_date = (
        result.get('selectionDate')
        or feed.get('selectionDate')
        or config.get('selection_date')
    )
    locked_at = result.get('lockedAtUtc') or config.get('locked_at_utc')

    if selection_date:
        result['selectionDate'] = selection_date
    if locked_at:
        result['lockedAtUtc'] = locked_at

    if selected:
        result.setdefault('pick', selected.get('pick'))
        result.setdefault('pickSide', selected.get('pick_side'))
        result.setdefault('lockedOdds', selected.get('odds'))
        result.setdefault('confidence', selected.get('confidence'))
        result.setdefault('league', selected.get('league'))
        result.setdefault('country', selected.get('country'))
        result.setdefault('predictedScore', selected.get('predicted_score'))

    # Keep the original locked 1X2 price as an immutable historical field.
    if result.get('lockedOdds') is None and result.get('odds') is not None:
        result['lockedOdds'] = result.get('odds')

    identity_fixture = str(result.get('providerFixtureId') or result.get('fixtureId') or '').strip()
    if selection_date and identity_fixture:
        result['selectionIdentity'] = f'{selection_date}:{identity_fixture}'

    outcome = str(result.get('outcome') or 'pending').lower()
    result['resultStatus'] = outcome.upper()
    if outcome in SETTLED_OUTCOMES and not result.get('settledAt'):
        result['settledAt'] = result.get('updatedAt') or feed.get('generatedAt')

    return result


def merge_missing(newer, older):
    merged = dict(newer)
    for key, value in older.items():
        if key not in merged or merged.get(key) in (None, '', []):
            merged[key] = value
    return merged


def record_contract_complete(item):
    return bool(
        item.get('selectionDate')
        and item.get('pick')
        and number_or_none(item.get('lockedOdds')) is not None
    )


def recent_settled_history(max_commits=160):
    merged = {}

    def absorb(feed, config=None):
        for raw_item in feed.get('results') or []:
            if not isinstance(raw_item, dict) or not is_settled(raw_item):
                continue
            item = enrich_result(raw_item, feed, config)
            key = result_key(item)
            if not key:
                continue
            if key in merged:
                merged[key] = merge_missing(merged[key], item)
            else:
                merged[key] = item

    current_feed = read_json(RESULT_FEED)
    current_config = read_json(SELECTION)
    absorb(current_feed, current_config)

    try:
        hashes = subprocess.check_output(
            ['git', 'log', f'--max-count={max_commits}', '--format=%H', '--', 'result-feed.json'],
            text=True,
        ).splitlines()
    except Exception:
        hashes = []

    for commit in hashes:
        feed = git_json(commit, 'result-feed.json')
        if not feed:
            continue
        needs_contract_backfill = any(
            isinstance(item, dict)
            and is_settled(item)
            and not record_contract_complete(enrich_result(item, feed, {}))
            for item in feed.get('results') or []
        )
        config = git_json(commit, 'selected-live-matches.json') if needs_contract_backfill else {}
        absorb(feed, config)

        if merged and all(record_contract_complete(item) for item in merged.values()):
            break

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


def average_locked_odds(results):
    values = []
    for item in results:
        if item.get('counted', True) is False:
            continue
        if str(item.get('outcome') or '').lower() not in COUNTED_OUTCOMES:
            continue
        odds = number_or_none(item.get('lockedOdds'))
        if odds is not None and odds > 0:
            values.append(odds)
    return round(sum(values) / len(values), 2) if values else 0.0


def summary_for(results, generated_at=None):
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
        'averageOdds': average_locked_odds(counted),
        'finalizedAt': generated_at if pending == 0 else None,
    }


def cumulative_series(results):
    ordered = sorted(
        [
            item for item in results
            if item.get('counted', True) is not False
            and str(item.get('outcome') or '').lower() in COUNTED_OUTCOMES
        ],
        key=lambda item: (str(item.get('kickoffUtc') or ''), str(item.get('providerFixtureId') or item.get('fixtureId') or '')),
    )
    correct = 0
    incorrect = 0
    series = []
    for index, item in enumerate(ordered, start=1):
        outcome = str(item.get('outcome') or '').lower()
        if outcome == 'correct':
            correct += 1
        elif outcome == 'incorrect':
            incorrect += 1
        series.append({
            'index': index,
            'selectionDate': item.get('selectionDate'),
            'fixtureId': item.get('providerFixtureId') or item.get('fixtureId'),
            'kickoffUtc': item.get('kickoffUtc'),
            'outcome': outcome,
            'correct': correct,
            'incorrect': incorrect,
        })
    return series


def daily_summaries(results, generated_at=None):
    grouped = {}
    for item in results:
        date = str(item.get('selectionDate') or '').strip()
        if not date:
            continue
        grouped.setdefault(date, []).append(item)

    summaries = []
    for date in sorted(grouped):
        summary = summary_for(grouped[date], generated_at)
        summary['selectionDate'] = date
        summary['status'] = 'FINAL' if summary['allSettled'] else 'PENDING_RESULTS'
        summaries.append(summary)
    return summaries


def preserve_cumulative_results(history):
    feed = read_json(RESULT_FEED)
    config = read_json(SELECTION)
    current_results = [
        enrich_result(item, feed, config)
        for item in feed.get('results') or []
        if isinstance(item, dict)
    ]
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
    results.sort(key=lambda item: (str(item.get('kickoffUtc') or ''), str(item.get('providerFixtureId') or item.get('fixtureId') or '')))
    generated_at = feed.get('generatedAt')

    daily = daily_summaries(results, generated_at)
    current_date = str(feed.get('selectionDate') or config.get('selection_date') or '')
    previous = [item for item in daily if item.get('selectionDate', '') < current_date]
    previous_summary = previous[-1] if previous else None
    final_daily = [item for item in daily if item.get('allSettled')]

    feed['schemaVersion'] = 2
    feed['currentSelection'] = {
        'selectionDate': current_date or None,
        'lockedAtUtc': config.get('locked_at_utc'),
        'matchCount': len(config.get('matches') or []),
        'source': '/selected-live-matches.json',
    }
    feed['currentBatchSummary'] = summary_for(current_results, generated_at)
    feed['currentBatchMarketSummary'] = feed.get('marketSummary') or {}
    feed['summary'] = summary_for(results, generated_at)
    feed['marketSummary'] = {
        'btts': standard_market_summary(results, 'btts'),
        'doubleChance': standard_market_summary(results, 'doubleChance'),
        'asianHandicap': asian_market_summary(results),
    }
    feed['cumulativeSeries'] = cumulative_series(results)
    feed['dailySummaries'] = daily
    feed['previousSelectionSummary'] = previous_summary
    feed['latestFinalDailySummary'] = final_daily[-1] if final_daily else None
    feed['results'] = results
    feed['historyMode'] = 'CUMULATIVE_CONFIRMED_PLUS_CURRENT'
    feed['historyCount'] = max(0, len(results) - len(current_results))
    feed['dataContract'] = {
        'mainStatistics': 'summary.correct / summary.incorrect / summary.accuracy / summary.averageOdds',
        'graph': 'cumulativeSeries',
        'dailyResults': 'dailySummaries + results filtered by selectionDate',
        'currentSelection': '/selected-live-matches.json',
    }

    RESULT_FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'event': 'cumulative_result_feed_preserved',
        'schemaVersion': feed['schemaVersion'],
        'current': len(current_results),
        'history': feed['historyCount'],
        'total': len(results),
        'pending': feed['summary']['pending'],
        'averageOdds': feed['summary']['averageOdds'],
        'dailySummaryCount': len(daily),
        'previousSelectionDate': previous_summary.get('selectionDate') if previous_summary else None,
    }))


history_before_refresh = recent_settled_history()
source = SOURCE.read_text(encoding='utf-8')
if OLD not in source:
    raise RuntimeError('Live refresh batch patch target not found; inspect refresh_live_selected.py before running.')

patched = source.replace(OLD, NEW, 1)
print('NOMAD live refresh: fixture ids will be requested in API batches of 20.')
exec(compile(patched, str(SOURCE), 'exec'), {'__name__': '__main__', '__file__': str(SOURCE)})
preserve_cumulative_results(history_before_refresh)
