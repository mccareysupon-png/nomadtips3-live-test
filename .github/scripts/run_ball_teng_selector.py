from pathlib import Path

SOURCE = Path('.github/scripts/auto_select_next.py')

OLD_SCORE = '''    common_edge, common_count = common_opponent_edge(home_overall, away_overall)\n    score = (\n        (home_overall["ppg"] - away_overall["ppg"]) * 0.34\n        + (home_venue["ppg"] - away_venue["ppg"]) * 0.36\n        + (home_overall["gdpg"] - away_overall["gdpg"]) * 0.18\n        + common_edge * 0.12\n    )\n'''

NEW_SCORE = '''    # BALL TENG v2: the legacy unranked common-opponent 12% term is retired.\n    # Ranked A-B-C / league-standing context is applied after prequalification by\n    # apply_confidence_policy.py, using the dedicated standings weight from config.\n    score = (\n        (home_overall["ppg"] - away_overall["ppg"]) * float(rules.get("overall_ppg_weight", 0.34))\n        + (home_venue["ppg"] - away_venue["ppg"]) * float(rules.get("venue_ppg_weight", 0.36))\n        + (home_overall["gdpg"] - away_overall["gdpg"]) * float(rules.get("goal_difference_weight", 0.18))\n    )\n    common_edge, common_count = 0.0, 0\n'''

source = SOURCE.read_text(encoding='utf-8')
if OLD_SCORE not in source:
    raise RuntimeError('BALL TENG selector patch target not found; inspect auto_select_next.py before running.')

patched = source.replace(OLD_SCORE, NEW_SCORE, 1)
print('NOMAD BALL TENG: legacy unranked common-opponent 12% term disabled; ranked standings context will replace it.')
exec(compile(patched, str(SOURCE), 'exec'), {'__name__': '__main__', '__file__': str(SOURCE)})
