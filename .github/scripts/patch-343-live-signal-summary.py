from pathlib import Path

js_path=Path('nomad-live-343/live-stable-343.js')
css_path=Path('nomad-live-343/live-stable-343.css')
html_path=Path('nomad-live-343/index.html')

js=js_path.read_text()
css=css_path.read_text()
html=html_path.read_text()

repls=[
("const openedIds=new Set();let lastInteractedId=null,busy=false,lastSnapshot=null,lastSignalAt=0,lockedSignals=new Set(),signalsReady=false;",
 "const openedIds=new Set();let lastInteractedId=null,busy=false,lastSnapshot=null,lastSignalAt=0,lockedSignals=new Set(),lockedSignalDetails=new Map(),signalsReady=false;"),
("function signalState(f){if(!signalsReady)return{key:'unknown',text:'SIGNAL —'};return lockedSignals.has(fixtureKey(f))?{key:'locked',text:'SIGNAL LOCKED'}:{key:'none',text:'NO SIGNAL'}}",
 "function signalState(f){if(!signalsReady)return{key:'unknown',text:'SIGNAL —'};return lockedSignals.has(fixtureKey(f))?{key:'locked',text:'SIGNAL LOCKED'}:{key:'none',text:'NO SIGNAL'}}\nfunction signalMarketShort(s){const key=String(s?.market||'').toLowerCase();if(key.includes('btts'))return'BTTS';if(key.includes('1x2'))return'1X2';if(key.includes('corner')&&key.includes('ah'))return'CORNER AH';if(key.includes('card')&&key.includes('ah'))return'CARD AH';if(key.includes('ah'))return'AH';if(key.includes('corner'))return'CORNERS';if(key.includes('card'))return'CARDS';if(key.includes('over')||key.includes('under'))return'O/U';return String(s?.marketLabel||s?.market||'MARKET').toUpperCase()}\nfunction signalLineText(s){const line=num(s?.line),market=signalMarketShort(s);if(line===null)return market;const raw=show(line,2),signed=(market.includes('AH')&&line>0)?`+${raw}`:raw;return`${market} ${signed}`}\nfunction signalSummaryText(f){const s=lockedSignalDetails.get(fixtureKey(f));if(!s)return'';const selection=String(s?.selection||'').trim().toUpperCase();const bookmaker=String(s?.bookmaker||'').trim();const odds=num(s?.odds);if(!selection||!bookmaker||odds===null)return'';return`${selection} · ${bookmaker} ${Number(odds).toFixed(2)} · ${signalLineText(s)}`}"),
("<div class=\"fixture-side\"><span class=\"signal-state\" data-field=\"signal\"><i aria-hidden=\"true\"></i><span data-field=\"signal-text\"></span></span></div></div></div><span class=\"expand-cue\" aria-hidden=\"true\">▼</span>",
 "<div class=\"fixture-side\"><span class=\"signal-state\" data-field=\"signal\"><i aria-hidden=\"true\"></i><span data-field=\"signal-text\"></span></span></div></div><div class=\"signal-lock-summary\" data-field=\"signal-summary\" hidden></div></div><span class=\"expand-cue\" aria-hidden=\"true\">▼</span>"),
("const sig=signalState(f),sigEl=card.querySelector('[data-field=\"signal\"]');if(sigEl){sigEl.className=`signal-state ${sig.key}`;setText(sigEl.querySelector('[data-field=\"signal-text\"]'),sig.text)}if(!initial&&prevKind&&prevKind!==kind)",
 "const sig=signalState(f),sigEl=card.querySelector('[data-field=\"signal\"]');if(sigEl){sigEl.className=`signal-state ${sig.key}`;setText(sigEl.querySelector('[data-field=\"signal-text\"]'),sig.text)}const summaryEl=card.querySelector('[data-field=\"signal-summary\"]');if(summaryEl){const summary=signalSummaryText(f);setText(summaryEl,summary);summaryEl.hidden=!(sig.key==='locked'&&summary)}if(!initial&&prevKind&&prevKind!==kind)"),
("lockedSignals=new Set(j.signals.map(x=>String(x?.fixtureId??'')).filter(Boolean));signalsReady=true",
 "const rows=j.signals.slice().sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));lockedSignalDetails=new Map();for(const s of rows){const id=String(s?.fixtureId??'').trim();if(id&&!lockedSignalDetails.has(id))lockedSignalDetails.set(id,s)}lockedSignals=new Set(lockedSignalDetails.keys());signalsReady=true")
]

for old,new in repls:
    if old not in js:
        raise SystemExit(f'JS_PATCH_ANCHOR_MISSING: {old[:100]}')
    js=js.replace(old,new,1)

css_anchor=".signal-state.unknown{color:#68736c}.signal-state.unknown i{background:#566159}\n"
css_new=css_anchor+".signal-lock-summary{margin-top:4px;padding-top:3px;border-top:1px solid rgba(98,232,143,.08);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#9fcbb0;font-size:8px;line-height:1.2;font-weight:800;letter-spacing:.012em;font-variant-numeric:tabular-nums}\n"
if css_anchor not in css:
    raise SystemExit('CSS_PATCH_ANCHOR_MISSING')
css=css.replace(css_anchor,css_new,1)
mobile_anchor=".scoreboard-default{padding:5px 8px 6px!important}.fixture-scoreboard{grid-template-columns:46px minmax(0,1fr) 54px minmax(0,1fr) 70px;gap:4px}.fixture-date{font-size:8px}.fixture-clock{font-size:9px}.team-slot{font-size:9px}.score-core strong{font-size:14px}.half-score{font-size:7px}.signal-state{font-size:6.8px;gap:3px}.signal-state i{width:4px;height:4px;flex-basis:4px}.event-details{padding:10px 8px}"
mobile_new=".scoreboard-default{padding:5px 8px 6px!important}.fixture-scoreboard{grid-template-columns:46px minmax(0,1fr) 54px minmax(0,1fr) 70px;gap:4px}.fixture-date{font-size:8px}.fixture-clock{font-size:9px}.team-slot{font-size:9px}.score-core strong{font-size:14px}.half-score{font-size:7px}.signal-state{font-size:6.8px;gap:3px}.signal-state i{width:4px;height:4px;flex-basis:4px}.signal-lock-summary{font-size:6.9px;white-space:normal;line-height:1.25;margin-top:3px;padding-top:3px;overflow-wrap:anywhere}.event-details{padding:10px 8px}"
if mobile_anchor not in css:
    raise SystemExit('CSS_MOBILE_ANCHOR_MISSING')
css=css.replace(mobile_anchor,mobile_new,1)

html=html.replace('live-stable-343.css?v=343-stat-bars-dim10-v1','live-stable-343.css?v=343-live-signal-summary-v1',1)
html=html.replace('live-stable-343.js?v=343-stat-bars-v1','live-stable-343.js?v=343-live-signal-summary-v1',1)
if '343-live-signal-summary-v1' not in html:
    raise SystemExit('HTML_CACHE_BUSTER_PATCH_FAILED')

js_path.write_text(js)
css_path.write_text(css)
html_path.write_text(html)
print('patched live default card signal summary')
