from pathlib import Path

APP = Path('nomad-live-343/app.css')
SETTINGS = Path('nomad-live-343/settings.css')
HTMLS = [
    Path('nomad-live-343/index.html'),
    Path('nomad-live-343/signal.html'),
    Path('nomad-live-343/statistics.html'),
    Path('nomad-live-343/settings.html'),
]

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

app = APP.read_text()

# First-time conversion from the legacy 1240px shell.
if '--content-max:1240px;' in app:
    app = replace_once(app,
        '--content-max:1240px;',
        '--content-max:none;--edge-gutter:clamp(6px,.8vw,14px);',
        'content max')
    app = replace_once(app,
        '.topbar-inner{max-width:var(--content-max);min-height:64px;margin:auto;padding:0 16px;',
        '.topbar-inner{width:100%;max-width:none;min-height:64px;margin:0;padding:0 max(var(--edge-gutter),env(safe-area-inset-right,0px)) 0 max(var(--edge-gutter),env(safe-area-inset-left,0px));',
        'desktop topbar')
    app = replace_once(app,
        '.shell{max-width:var(--content-max);margin:0 auto;padding:18px 16px 72px}',
        '.shell{width:100%;max-width:none;margin:0;padding:18px max(var(--edge-gutter),env(safe-area-inset-right,0px)) 72px max(var(--edge-gutter),env(safe-area-inset-left,0px))}',
        'desktop shell')
    app = replace_once(app,
        '.live-board-shell{max-width:var(--content-max)}',
        '.live-board-shell{width:100%;max-width:none}',
        'live shell')
    app = replace_once(app,
        '.topbar-inner{min-height:60px;padding:0 10px;justify-content:center;position:relative}',
        '.topbar-inner{min-height:60px;padding:0 max(4px,env(safe-area-inset-right,0px)) 0 max(4px,env(safe-area-inset-left,0px));justify-content:center;position:relative}',
        'mobile topbar')
    app = replace_once(app,
        '.shell{padding:12px 8px 72px}',
        '.shell{padding:12px max(4px,env(safe-area-inset-right,0px)) 72px max(4px,env(safe-area-inset-left,0px))}',
        'mobile shell')

# The legacy stable gutter reserves 15px even when the device has overlay/no visible scrollbars.
# Use the browser's actual available viewport instead; physical scrollbars and safe areas still win.
if 'scrollbar-gutter:stable' in app:
    app = replace_once(app, 'scrollbar-gutter:stable', 'scrollbar-gutter:auto', 'scrollbar gutter')
if '--content-max:none;--edge-gutter:' not in app or '.shell{width:100%;max-width:none' not in app:
    raise SystemExit('app full-width markers missing')
if 'scrollbar-gutter:auto' not in app:
    raise SystemExit('auto scrollbar gutter marker missing')
APP.write_text(app)

settings = SETTINGS.read_text()
if '.owner-shell{max-width:var(--content-max);margin:0 auto;padding:18px 16px 80px}' in settings:
    settings = replace_once(settings,
        '.owner-shell{max-width:var(--content-max);margin:0 auto;padding:18px 16px 80px}',
        '.owner-shell{width:100%;max-width:none;margin:0;padding:18px max(var(--edge-gutter),env(safe-area-inset-right,0px)) 80px max(var(--edge-gutter),env(safe-area-inset-left,0px))}',
        'settings desktop shell')
    settings = replace_once(settings,
        '@media(max-width:760px){.owner-shell{padding:12px 8px 72px}',
        '@media(max-width:760px){.owner-shell{padding:12px max(4px,env(safe-area-inset-right,0px)) 72px max(4px,env(safe-area-inset-left,0px))}',
        'settings mobile shell')
if '.owner-shell{width:100%;max-width:none' not in settings:
    raise SystemExit('settings full-width marker missing')
SETTINGS.write_text(settings)

for path in HTMLS:
    html = path.read_text()
    for old in ('app.css?v=343-team-palette-v1', 'app.css?v=343-public-v1', 'app.css?v=343-full-width-v1'):
        html = html.replace(old, 'app.css?v=343-full-width-v2')
    if path.name == 'settings.html':
        for old in ('settings.css?v=343-allmarkets-v1', 'settings.css?v=343-full-width-v1'):
            html = html.replace(old, 'settings.css?v=343-full-width-v2')
    if 'app.css?v=343-full-width-v2' not in html:
        raise SystemExit(f'{path}: app cache buster not updated')
    path.write_text(html)

print('patched 3.43 full-width shells v2 for all devices')
