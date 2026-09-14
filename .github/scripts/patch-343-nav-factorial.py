from pathlib import Path

ROOT=Path('nomad-live-343')
HTMLS=[ROOT/'index.html',ROOT/'signal.html',ROOT/'statistics.html']

old_style='<style data-nomad-nav-stability="343-nav-stable-v2">html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}body{margin:0;background:#101612}</style>'
critical='''<style data-nomad-nav-stability="343-nav-factorial-v1">:root{--edge-gutter:clamp(6px,.8vw,14px)}*{box-sizing:border-box}html{background:#101612;overflow-y:scroll;scrollbar-gutter:stable}body{margin:0;background:#101612}.topbar{position:sticky;top:0;z-index:30;background:#183d27;border-bottom:1px solid rgba(255,255,255,.08)}.topbar-inner{width:100%;max-width:none;min-height:64px;margin:0;padding:0 max(var(--edge-gutter),env(safe-area-inset-right,0px)) 0 max(var(--edge-gutter),env(safe-area-inset-left,0px));display:flex;align-items:center;gap:24px}.brand{display:block;width:176px;height:35px}.topnav{margin-left:auto;display:flex;align-items:stretch;height:64px}.topnav a{display:flex;align-items:center;padding:0 15px;border-bottom:3px solid transparent}.shell{width:100%;max-width:none;margin:0;padding:18px max(var(--edge-gutter),env(safe-area-inset-right,0px)) 72px max(var(--edge-gutter),env(safe-area-inset-left,0px))}.mobile-nav{display:none}@media(max-width:760px){.topbar-inner{min-height:60px;padding:0 max(4px,env(safe-area-inset-right,0px)) 0 max(4px,env(safe-area-inset-left,0px));justify-content:center;position:relative}.brand{width:156px;height:31px}.topnav{display:none}.shell{padding:12px max(4px,env(safe-area-inset-right,0px)) 72px max(4px,env(safe-area-inset-left,0px))}.mobile-nav{position:fixed;left:0;right:0;bottom:0;z-index:40;height:56px;display:grid;grid-template-columns:repeat(3,1fr)}}</style>'''

for p in HTMLS:
    s=p.read_text()
    if s.count(old_style)!=1:
        raise SystemExit(f'{p}: expected nav-stable-v2 critical style once, got {s.count(old_style)}')
    s=s.replace(old_style,critical,1)
    if s.count('app.css?v=343-nav-stable-v2')!=1:
        raise SystemExit(f'{p}: app.css nav-stable-v2 marker missing/duplicate')
    s=s.replace('app.css?v=343-nav-stable-v2','app.css?v=343-nav-factorial-v1',1)
    p.write_text(s)

p=ROOT/'statistics.html'
s=p.read_text()
old='<nav class="statistics-nav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
new='<nav class="topnav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
if s.count(old)!=1:
    raise SystemExit('statistics: old statistics-nav missing/duplicate')
s=s.replace(old,new,1)
mobile='<nav class="mobile-nav"><a data-nav="live" href="index.html">Live Scores</a><a data-nav="signal" href="signal.html">Signals</a><a data-nav="statistics" href="statistics.html">Statistics</a></nav>'
needle='</main>\n<script src="odds-format-343.js'
if s.count(needle)!=1:
    raise SystemExit('statistics: script insertion point missing/duplicate')
s=s.replace(needle,f'</main>\n{mobile}\n<script src="odds-format-343.js',1)
if s.count('statistics-page-343.css?v=343-stat-nav-stable-v1')!=1:
    raise SystemExit('statistics: old statistics css marker missing')
s=s.replace('statistics-page-343.css?v=343-stat-nav-stable-v1','statistics-page-343.css?v=343-stat-nav-unified-v2',1)
p.write_text(s)

stats_css=ROOT/'statistics-page-343.css'
stats_css.write_text('''/* NOMAD 3.43 Statistics-only content layout. Navigation now uses the exact shared topnav/mobile-nav DOM from Live and Signals. */\nbody[data-page="statistics"] .public-stat-table th{position:static;top:auto}\nbody[data-page="statistics"] .stat-kpi-grid{grid-template-columns:repeat(5,minmax(0,1fr))}\n@media(max-width:760px){body[data-page="statistics"] .stat-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n''')

print('patched 3.43 factorial navigation: identical nav DOM on all three pages + critical first-frame geometry')
