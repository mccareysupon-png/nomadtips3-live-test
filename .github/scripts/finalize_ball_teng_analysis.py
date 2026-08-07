import json
from pathlib import Path

RULES_PATH = Path('config/nomad-auto-rules.json')
SELECTED_PATH = Path('selected-live-matches.json')
REPORT_PATH = Path('auto-selection-report.json')


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return {} if fallback is None else fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def pct(value):
    try:
        return round(float(value) * 100, 2)
    except (TypeError, ValueError):
        return 0.0


def ranked_abc_text(context):
    if not context or not context.get('available'):
        return 'LIMITED — league standings unavailable; core form model fallback used'
    selected_rank = context.get('selectedRank')
    opponent_rank = context.get('opponentRank')
    count = int(context.get('rankedCommonOpponentCount') or 0)
    edge = float(context.get('rankedCommonOpponentEdge') or 0.0)
    if count:
        return (
            f'Ranked A-B-C · selected rank {selected_rank} vs opponent rank {opponent_rank} · '
            f'{count} ranked shared opponent(s) · edge {edge:+.2f}'
        )
    return f'Standings context · selected rank {selected_rank} vs opponent rank {opponent_rank} · no ranked shared-opponent sample'


def policy_inputs():
    return [
        'overall PPG',
        'home/away PPG',
        'goal-difference rate',
        'league standing rank',
        'rank-weighted common-opponent A-B-C context',
    ]


def main():
    rules = read_json(RULES_PATH)
    selected = read_json(SELECTED_PATH)
    if not isinstance(selected.get('matches'), list):
        print(json.dumps({'status': 'SKIPPED_NO_SELECTIONS'}))
        return

    selected['system'] = 'NOMAD SYSTEM / BALL TENG AUTO TEST v.2'
    meta = selected.setdefault('rules', {})
    meta.pop('common_opponents', None)
    meta['ranked_standings_abc'] = True
    meta['legacy_unranked_common_opponent'] = False
    meta['model_weights'] = {
        'overallPpg': pct(rules.get('overall_ppg_weight', 0.34)),
        'homeAwayPpg': pct(rules.get('venue_ppg_weight', 0.36)),
        'goalDifference': pct(rules.get('goal_difference_weight', 0.18)),
        'rankedStandingsContext': pct(rules.get('standings_strength_weight', 0.32)),
        'standingDirectRankMix': pct(rules.get('standings_direct_rank_mix', 0.55)),
        'standingRankedCommonMix': pct(rules.get('standings_ranked_common_mix', 0.45)),
        'note': 'Ranked standings context is an adjustment layer; percentages are not summed as one flat 100% score.',
    }

    policy = selected.get('confidencePolicy') or {}
    policy['inputs'] = policy_inputs()
    policy['legacyCommonOpponentWeight'] = 0
    standings = policy.get('standings') if isinstance(policy.get('standings'), dict) else {}
    standings['strengthWeight'] = float(rules.get('standings_strength_weight', 0.32))
    standings['adjustmentCap'] = float(rules.get('standings_adjustment_cap', 0.32))
    policy['standings'] = standings
    selected['confidencePolicy'] = policy

    for match in selected.get('matches') or []:
        analysis = match.setdefault('auto_analysis', {})
        analysis.pop('commonOpponentCount', None)
        analysis.pop('commonOpponentEdge', None)
        context = analysis.get('standingsContext') or {}
        match['abc_result'] = ranked_abc_text(context)

    write_json(SELECTED_PATH, selected)

    if REPORT_PATH.exists():
        report = read_json(REPORT_PATH)
        report['ballTengPolicy'] = {
            'legacyCommonOpponentWeight': 0,
            'overallPpgWeight': pct(rules.get('overall_ppg_weight', 0.34)),
            'homeAwayPpgWeight': pct(rules.get('venue_ppg_weight', 0.36)),
            'goalDifferenceWeight': pct(rules.get('goal_difference_weight', 0.18)),
            'rankedStandingsContextWeight': pct(rules.get('standings_strength_weight', 0.32)),
            'directRankMix': pct(rules.get('standings_direct_rank_mix', 0.55)),
            'rankedCommonMix': pct(rules.get('standings_ranked_common_mix', 0.45)),
        }
        confidence = report.get('confidencePolicy') or {}
        confidence['inputs'] = policy_inputs()
        confidence['legacyCommonOpponentWeight'] = 0
        report['confidencePolicy'] = confidence
        write_json(REPORT_PATH, report)

    print(json.dumps({
        'status': 'BALL_TENG_POLICY_FINALIZED',
        'matches': len(selected.get('matches') or []),
        'legacyCommonOpponentWeight': 0,
        'rankedStandingsContextWeight': pct(rules.get('standings_strength_weight', 0.32)),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
