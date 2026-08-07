from pathlib import Path

SOURCE = Path('.github/scripts/refresh_live_selected.py')

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

source = SOURCE.read_text(encoding='utf-8')
if OLD not in source:
    raise RuntimeError('Live refresh batch patch target not found; inspect refresh_live_selected.py before running.')

patched = source.replace(OLD, NEW, 1)
print('NOMAD live refresh: fixture ids will be requested in API batches of 20.')
exec(compile(patched, str(SOURCE), 'exec'), {'__name__': '__main__', '__file__': str(SOURCE)})
