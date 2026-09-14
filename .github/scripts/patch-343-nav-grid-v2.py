from pathlib import Path

app=Path('nomad-live-343/app.css')
htmls=[Path('nomad-live-343/index.html'),Path('nomad-live-343/signal.html'),Path('nomad-live-343/statistics.html')]
marker='/* 343 HEADER NAV GRID V2 ONE ROW */'
s=app.read_text()
if marker not in s:
    s += '''\n\n/* 343 HEADER NAV GRID V2 ONE ROW */\n@media (min-width:761px){\n  .topbar-inner{display:grid!important;grid-template-columns:176px minmax(0,1fr) 254px 88px 122px!important;grid-template-rows:64px!important;column-gap:0!important;align-items:center!important;min-height:64px!important}\n  .topbar-inner>div:first-child{grid-column:1!important;grid-row:1!important;min-width:0}\n  .topbar-inner>.topnav{grid-column:3!important;grid-row:1!important;margin-left:0!important;width:254px!important;height:64px!important;justify-self:stretch!important}\n  .topbar-inner>.topnav>a{flex:1 1 0!important;justify-content:center!important;padding-left:8px!important;padding-right:8px!important}\n  .topbar-inner>.odds-format-control{grid-column:4!important;grid-row:1!important;position:relative!important;left:auto!important;right:auto!important;top:auto!important;transform:none!important;width:88px!important;min-width:88px!important;margin:0!important;justify-self:stretch!important}\n  .topbar-inner>.nomad343-language{grid-column:5!important;grid-row:1!important;position:static!important;right:auto!important;top:auto!important;transform:none!important;margin-left:10px!important;width:112px!important;justify-self:end!important}\n  .topbar-inner>.nomad343-language select{width:112px!important;min-width:112px!important;max-width:112px!important}\n}\n'''
    app.write_text(s)
for p in htmls:
    h=p.read_text()
    h=h.replace('app.css?v=343-full-width-v3-nav-grid','app.css?v=343-full-width-v4-nav-one-row')
    h=h.replace('app.css?v=343-full-width-v2','app.css?v=343-full-width-v4-nav-one-row')
    p.write_text(h)
print('header nav + odds + language locked to one desktop row; content shell untouched')
