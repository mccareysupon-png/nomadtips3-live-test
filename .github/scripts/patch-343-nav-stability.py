from pathlib import Path

APP = Path('nomad-live-343/app.css')
STAT_CSS = Path('nomad-live-343/statistics-page-343.css')
HTMLS = [
    Path('nomad-live-343/index.html'),
    Path('nomad-live-343/signal.html'),
    Path('nomad-live-343/statistics.html'),
    Path('nomad-live-343/settings.html'),
]

CRITICAL = '<style data-nomad-nav-stability="343-nav-stable-v2">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}body{margin:0;background:#101612}</style>'

app = APP.read_text()
if 'html{background:var(--bg);scrollbar-gutter:auto}' in app:
    app = app.replace(
        'html{background:var(--bg);scrollbar-gutter:auto}',
        'html{background:var(--bg);overflow-y:scroll;scrollbar-gutter:stable}',
        1,
    )
elif 'html{background:var(--bg);overflow-y:scroll;scrollbar-gutter:stable}' not in app:
    raise SystemExit('app.css: expected nav-stability html rule')
APP.write_text(app)

stat = STAT_CSS.read_text()
if 'height:58px;' in stat:
    stat = stat.replace('height:58px;', 'height:64px;', 1)
elif 'height:64px;' not in stat:
    raise SystemExit('statistics-page-343.css: desktop nav height marker not found')
STAT_CSS.write_text(stat)

for path in HTMLS:
    html = path.read_text()
    if 'data-nomad-nav-stability="343-nav-stable-v2"' not in html:
        needle = '<link rel="stylesheet" href="app.css?v=343-nav-stable-v1">'
        if needle not in html:
            raise SystemExit(f'{path}: nav-stable-v1 app css marker not found')
        html = html.replace(needle, CRITICAL + '<link rel="stylesheet" href="app.css?v=343-nav-stable-v2">', 1)
    else:
        html = html.replace('app.css?v=343-nav-stable-v1', 'app.css?v=343-nav-stable-v2')

    if path.name == 'statistics.html':
        html = html.replace(
            'statistics-page-343.css?v=343-stat-clean-v6-avg-entry-odds',
            'statistics-page-343.css?v=343-stat-nav-stable-v1',
            1,
        )
    path.write_text(html)

print('patched 3.43 nav stability v2: critical reset + stable scrollbar + 64px desktop statistics nav')
