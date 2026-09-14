from pathlib import Path

APP = Path('nomad-live-343/app.css')
HTMLS = [
    Path('nomad-live-343/index.html'),
    Path('nomad-live-343/signal.html'),
    Path('nomad-live-343/statistics.html'),
    Path('nomad-live-343/settings.html'),
]

app = APP.read_text()
old = 'html{background:var(--bg);scrollbar-gutter:auto}'
new = 'html{background:var(--bg);overflow-y:scroll;scrollbar-gutter:stable}'
count = app.count(old)
if count != 1:
    raise SystemExit(f'app.css: expected exactly 1 scrollbar rule, got {count}')
app = app.replace(old, new, 1)
APP.write_text(app)

for path in HTMLS:
    html = path.read_text()
    count = html.count('app.css?v=343-full-width-v2')
    if count != 1:
        raise SystemExit(f'{path}: expected full-width-v2 app css once, got {count}')
    html = html.replace('app.css?v=343-full-width-v2', 'app.css?v=343-nav-stable-v1', 1)
    path.write_text(html)

print('patched 3.43 navigation stability: persistent scrollbar gutter, no cross-page width shake')
