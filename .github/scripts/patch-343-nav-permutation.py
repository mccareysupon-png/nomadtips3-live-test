from pathlib import Path

FILES = [
    Path('nomad-live-343/index.html'),
    Path('nomad-live-343/signal.html'),
    Path('nomad-live-343/statistics.html'),
]

V2 = '<style data-nomad-nav-stability="343-nav-stable-v2">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}body{margin:0;background:#101612}</style>'
V3_PREFIX = '<style data-nomad-nav-stability="343-nav-stable-v3">'
V4 = '<style data-nomad-nav-stability="343-nav-stable-v4">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable;font-family:Arial,Helvetica,sans-serif}*{box-sizing:border-box}body{margin:0;background:#101612}.topbar{position:sticky;top:0;z-index:30;background:#183d27;border-bottom:1px solid rgba(255,255,255,.08)}body .topbar-inner{width:100%;max-width:none;min-height:64px;margin:0;padding:0 max(clamp(6px,.8vw,14px),env(safe-area-inset-right,0px)) 0 max(clamp(6px,.8vw,14px),env(safe-area-inset-left,0px));display:grid!important;grid-template-columns:176px minmax(0,1fr) auto 88px auto!important;column-gap:24px!important;align-items:center}body .topbar-inner>div:first-child{grid-column:1;min-width:176px;width:176px}.brand{display:block;width:176px;height:35px;font-size:0;line-height:0;background:url("ball46-logo.svg") no-repeat left center/contain}.brand span{display:none}.version{display:none!important}body .topbar-inner>.topnav{grid-column:3;margin-left:0!important;display:flex;align-items:stretch;height:64px}.topnav a{display:flex;align-items:center;padding:0 15px;text-decoration:none;font-size:12px;font-weight:800;border-bottom:3px solid transparent}body .topbar-inner>.odds-format-control{grid-column:4}body .topbar-inner>.nomad343-language{grid-column:5}.shell{width:100%;max-width:none;margin:0;padding:18px max(clamp(6px,.8vw,14px),env(safe-area-inset-right,0px)) 72px max(clamp(6px,.8vw,14px),env(safe-area-inset-left,0px))}.mobile-nav{display:none}@media(max-width:760px){body .topbar-inner{min-height:60px;padding:0 max(4px,env(safe-area-inset-right,0px)) 0 max(4px,env(safe-area-inset-left,0px));display:flex!important;justify-content:center;position:relative}body .topbar-inner>div:first-child{min-width:156px;width:auto}.brand{width:156px;height:31px;background-position:center}body .topbar-inner>.topnav{display:none}.shell{padding:12px max(4px,env(safe-area-inset-right,0px)) 72px max(4px,env(safe-area-inset-left,0px))}.mobile-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;height:56px;display:grid;grid-template-columns:repeat(3,1fr)}}</style>'


def replace_critical(text, path):
    if 'data-nomad-nav-stability="343-nav-stable-v4"' in text:
        if text.count('data-nomad-nav-stability="343-nav-stable-v4"') != 1:
            raise SystemExit(f'{path}: duplicate v4 critical style')
        return text
    if V2 in text:
        return text.replace(V2, V4, 1)
    marker = 'data-nomad-nav-stability="343-nav-stable-v3"'
    if marker in text:
        start = text.index('<style data-nomad-nav-stability="343-nav-stable-v3">')
        end = text.index('</style>', start) + len('</style>')
        return text[:start] + V4 + text[end:]
    raise SystemExit(f'{path}: expected nav critical style v2/v3/v4')

for path in FILES:
    text = replace_critical(path.read_text(), path)
    if 'app.css?v=343-nav-stable-v2' in text:
        text = text.replace('app.css?v=343-nav-stable-v2', 'app.css?v=343-nav-stable-v4', 1)
    elif 'app.css?v=343-nav-stable-v3' in text:
        text = text.replace('app.css?v=343-nav-stable-v3', 'app.css?v=343-nav-stable-v4', 1)
    elif text.count('app.css?v=343-nav-stable-v4') != 1:
        raise SystemExit(f'{path}: expected app v2/v3/v4 exactly once')
    path.write_text(text)

stats = Path('nomad-live-343/statistics.html')
text = stats.read_text()
old_nav = '<nav class="statistics-nav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
new_nav = '<nav class="topnav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
if old_nav in text:
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
    if text.count('data-nomad-nav-stability="343-nav-stable-v4"') != 1:
        raise SystemExit(f'{path}: missing v4 critical nav style')
    if text.count('app.css?v=343-nav-stable-v4') != 1:
        raise SystemExit(f'{path}: missing app v4 cachebuster')
    if text.count('<nav class="topnav">') != 1 or text.count('<nav class="mobile-nav">') != 1:
        raise SystemExit(f'{path}: nav DOM not canonical')

print('3.43 nav v4: reserved Logo/Nav/Odds/Language slots before JS injection; only three page HTML files')
