from pathlib import Path

smoke_path = Path('.github/workflows/prematch-ui-smoke.yml')
original_smoke = smoke_path.read_text() if smoke_path.exists() else None
code = Path('scripts/apply_stats_trend.py').read_text()
exec(compile(code, 'scripts/apply_stats_trend.py', 'exec'), {'__name__': '__main__'})
if original_smoke is not None:
    smoke_path.write_text(original_smoke)
