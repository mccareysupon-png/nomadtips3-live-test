from pathlib import Path

FILES = [
    Path('nomad-live-343/index.html'),
    Path('nomad-live-343/signal.html'),
    Path('nomad-live-343/statistics.html'),
]

OLD_STYLE = '<style data-nomad-nav-stability="343-nav-stable-v2">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}body{margin:0;background:#101612}</style>'
NEW_STYLE = '<style data-nomad-nav-stability="343-nav-stable-v3">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}*{box-sizing:border-box}body{margin:0;background:#101612}.topbar{position:sticky;top:0;z-index:30;background:#183d27;border-bottom:1px solid rgba(255,255,255,.08)}.topbar-inner{width:100%;max-width:none;min-height:64px;margin:0;padding:0 max(clamp(6px,.8vw,14px),env(safe-area-inset-right,0px)) 0 max(clamp(6px,.8vw,14px),env(safe-area-inset-left,0px));display:flex;align-items:center;gap:24px}.brand{display:block;width:176px;height:35px}.topnav{margin-left:auto;display:flex;align-items:stretch;height:64px}.topnav a{display:flex;align-items:center;padding:0 15px;text-decoration:none;font-size:12px;font-weight:800;border-bottom:3px solid transparent}.shell{width:100%;max-width:none;margin:0;padding:18px max(clamp(6px,.8vw,14px),env(safe-area-inset-right,0px)) 72px max(clamp(6px,.8vw,14px),env(safe-area-inset-left,0px))}.mobile-nav{display:none}@media(max-width:760px){.topbar-inner{min-height:60px;padding:0 max(4px,env(safe-area-inset-right,0px)) 0 max(4px,env(safe-area-inset-left,0px));justify-content:center}.brand{width:156px;height:31px}.topnav{display:none}.shell{padding:12px max(4px,env(safe-area-inset-right,0px)) 72px max(4px,env(safe-area-inset-left,0px))}.mobile-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;height:56px;display:grid;grid-template-columns:repeat(3,1fr)}}</style>'

for path in FILES:
    text = path.read_text()
    if OLD_STYLE in text:
        if text.count(OLD_STYLE) != 1:
            raise SystemExit(f'{path}: duplicate nav-stable-v2 style')
        text = text.replace(OLD_STYLE, NEW_STYLE, 1)
    elif text.count(NEW_STYLE) != 1:
        raise SystemExit(f'{path}: expected exactly one v2 or v3 critical style')

    if 'app.css?v=343-nav-stable-v2' in text:
        if text.count('app.css?v=343-nav-stable-v2') != 1:
            raise SystemExit(f'{path}: duplicate app v2')
        text = text.replace('app.css?v=343-nav-stable-v2', 'app.css?v=343-nav-stable-v3', 1)
    elif text.count('app.css?v=343-nav-stable-v3') != 1:
        raise SystemExit(f'{path}: expected exactly one app v2 or v3')
    path.write_text(text)

stats = Path('nomad-live-343/statistics.html')
text = stats.read_text()
old_nav = '<nav class="statistics-nav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
new_nav = '<nav class="topnav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
if old_nav in text:
    if text.count(old_nav) != 1:
        raise SystemExit('statistics.html: duplicate statistics-nav')
    text = text.replace(old_nav, new_nav, 1)
elif text.count(new_nav) != 1:
    raise SystemExit('statistics.html: canonical topnav missing')

mobile_nav = '<nav class="mobile-nav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
if mobile_nav not in text:
    needle = '</main>\n<script src="odds-format-343.js'
    if needle not in text:
        raise SystemExit('statistics.html: script insertion point missing')
    text = text.replace(needle, '</main>\n' + mobile_nav + '\n<script src="odds-format-343.js', 1)
elif text.count(mobile_nav) != 1:
    raise SystemExit('statistics.html: duplicate mobile-nav')
stats.write_text(text)

for path in FILES:
    text = path.read_text()
    if text.count('data-nomad-nav-stability="343-nav-stable-v3"') != 1:
        raise SystemExit(f'{path}: missing v3 critical nav style')
    if text.count('app.css?v=343-nav-stable-v3') != 1:
        raise SystemExit(f'{path}: missing app v3 cachebuster')
    if text.count('<nav class="topnav">') != 1:
        raise SystemExit(f'{path}: desktop nav not canonical')
    if text.count('<nav class="mobile-nav">') != 1:
        raise SystemExit(f'{path}: mobile nav not canonical')

print('3.43 navigation patch verified/applied: only Live/Signals/Statistics nav shell')
