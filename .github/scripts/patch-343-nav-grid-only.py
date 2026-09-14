from pathlib import Path

app = Path('nomad-live-343/app.css')
htmls = [Path('nomad-live-343/index.html'), Path('nomad-live-343/signal.html'), Path('nomad-live-343/statistics.html')]
marker = '/* 343 HEADER NAV GRID ONLY V1 */'
css = app.read_text()
if marker not in css:
    css += '''\n\n/* 343 HEADER NAV GRID ONLY V1 */\n@media (min-width:761px){\n  .topbar-inner{display:grid!important;grid-template-columns:176px minmax(0,1fr) 254px 122px!important;column-gap:0!important;align-items:center!important}\n  .topbar-inner>div:first-child{grid-column:1!important;min-width:0}\n  .topbar-inner>.topnav{grid-column:3!important;margin-left:0!important;width:254px!important;height:64px!important;justify-self:stretch!important}\n  .topbar-inner>.topnav>a{flex:1 1 0!important;justify-content:center!important;padding-left:8px!important;padding-right:8px!important}\n  .topbar-inner>.nomad343-language{grid-column:4!important;margin-left:10px!important;width:112px!important;justify-self:end!important}\n  .topbar-inner>.nomad343-language select{width:112px!important;min-width:112px!important;max-width:112px!important}\n}\n'''
    app.write_text(css)

for p in htmls:
    s = p.read_text()
    s = s.replace('app.css?v=343-full-width-v2', 'app.css?v=343-full-width-v3-nav-grid')
    p.write_text(s)

print('patched header nav grid only; shell/full-width rules untouched')
