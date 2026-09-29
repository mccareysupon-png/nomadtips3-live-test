#!/usr/bin/env python3
from pathlib import Path
import re, sys

ROOT=Path('ball46-topcard-candidate-20260929')
JS=ROOT/'dashboard-v2-stage3.js'
CSS=ROOT/'singlepage-workspace-343.css'
IDX=ROOT/'index.html'

for p in (JS,CSS,IDX):
    if not p.exists(): raise SystemExit(f'STOP: missing exact production snapshot {p}')

js=JS.read_text(encoding='utf-8')
css=CSS.read_text(encoding='utf-8')
idx=IDX.read_text(encoding='utf-8')

# Guard the exact current Production renderer family before any edit.
required=[
    "function renderWorkspaceScorebar(){",
    "const liveScoreText=x=>scoreText(x?.mirrorScore??x?.scoreAt??x?.entryScore);",
    "workspace-scorebar-signal-result",
    "workspace-scorebar-pending",
    "slot.innerHTML='<div class=\"workspace-scorebar-grid\">'"
]
for token in required:
    if token not in js: raise SystemExit('STOP: renderer drift/missing marker: '+token)
if 'BALL46_SCOREBAR_DETAILS_20260929' in js or 'BALL46_SCOREBAR_DETAILS_20260929' in css:
    raise SystemExit('STOP: patch marker already exists; refusing double patch')

# Extract one function by brace balance; template/string aware enough for current source.
def extract_function(src,name):
    needle=f'function {name}('
    s=src.find(needle)
    if s<0: raise SystemExit('STOP: function not found '+name)
    b=src.find('{',s)
    depth=0; quote=None; esc=False; i=b
    while i<len(src):
        c=src[i]
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
        else:
            if c in "'\"`": quote=c
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0: return s,i+1,src[s:i+1]
        i+=1
    raise SystemExit('STOP: unbalanced renderer function')

s,e,old=extract_function(js,'renderWorkspaceScorebar')
if old.count('workspace-scorebar-cell')<4 or len(old)<2500:
    raise SystemExit('STOP: unexpected renderer shape')

new=r'''function renderWorkspaceScorebar(){
 const slot=document.querySelector('[data-workspace-scorebar-slot]');if(!slot)return;
 const resultMeta=raw=>{const r=String(raw||'').trim().toUpperCase();if(r==='WIN')return{cls:'win',label:'WIN'};if(r==='HALF_WIN')return{cls:'win',label:'WIN ½'};if(r==='LOSS')return{cls:'loss',label:'LOSS'};if(r==='HALF_LOSS')return{cls:'loss',label:'LOSS ½'};if(r==='PUSH'||r==='DRAW')return{cls:'draw',label:'DRAW'};return{cls:'draw',label:r||'DRAW'}};
 const scoreText=v=>{const p=pair(v);return p.home===null||p.away===null?'—':show(p.home)+'–'+show(p.away)};
 const liveScoreText=x=>scoreText(x?.mirrorScore??x?.scoreAt??x?.entryScore);
 const lineText=x=>{const n=num(x?.line??x?.selectionLine);if(n===null)return'';const m=String(x?.market||x?.marketLabel||'').toLowerCase();return(/ah|handicap/.test(m)&&n>0?'+':'')+show(n,2)};
 const pickText=x=>[String(x?.selection||'').trim().toUpperCase(),lineText(x)].filter(Boolean).join(' ')||'SIGNAL';
 const marketText=x=>String(x?.marketLabel||x?.market||'SIGNAL').replaceAll('_',' ').replace(/\s+/g,' ').trim();
 const matchText=x=>[x?.home?.name,x?.away?.name].filter(Boolean).join(' · ')||'—';
 /* BALL46_SCOREBAR_DETAILS_20260929: presentation only; reads existing signal/statistics fields. */
 const marketKind=x=>{const p=String(x?.providerMarket||'').toLowerCase(),m=String(x?.market||'').toLowerCase(),l=String(x?.marketLabel||'').toLowerCase(),all=p+' '+m+' '+l;if(/corner/.test(all))return'corner';if(/card/.test(all))return'cards';if(p==='1x2'||/\b1x2\b/.test(all))return'score';if(p==='asian'||/\bah\b|handicap/.test(all))return'score';if(p==='goalline'||/goal|over|under|btts|both teams/.test(all))return'score';return'unknown'};
 const pairDetail=(v,prefix)=>{const p=pair(v);if(p.home===null||p.away===null)return'—';const total=num(p.home)+num(p.away);return(prefix?prefix+' ':'')+show(total)+' ('+show(p.home)+'–'+show(p.away)+')'};
 const cardDetail=v=>{if(!v||typeof v!=='object')return'—';const hy=num(v?.home?.yellow),hr=num(v?.home?.red),ay=num(v?.away?.yellow),ar=num(v?.away?.red);if([hy,hr,ay,ar].every(n=>n===null))return'—';const y=(hy??0)+(ay??0),r=(hr??0)+(ar??0);return'Y '+show(y)+' · R '+show(r)};
 const phaseValue=(x,phase)=>{const kind=marketKind(x);if(kind==='corner')return pairDetail(phase==='entry'?x?.entryCorners:phase==='live'?x?.liveCorners:x?.finalCorners,'C');if(kind==='cards')return cardDetail(phase==='entry'?x?.entryCards:phase==='live'?x?.liveCards:x?.finalCards);if(kind==='score')return scoreText(phase==='entry'?(x?.entryScore??x?.scoreAt):phase==='live'?(x?.mirrorScore??x?.scoreAt):x?.finalScore);return'—'};
 const detailHtml=(x,settled)=>{const entry=phaseValue(x,'entry'),entryMin=num(x?.entryMinute??x?.minute),current=phaseValue(x,settled?'final':'live'),label=settled?'FT':'NOW',minute=entryMin===null?'—':Math.max(0,Math.round(entryMin))+"'";return '<span class="workspace-scorebar-details" data-scorebar-details="1"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>'+esc(entry)+'</b></span><span class="workspace-scorebar-detail-minute" title="Entry minute">'+esc(minute)+'</span><span class="workspace-scorebar-detail-current"><i>'+label+'</i><b>'+esc(current)+'</b></span></span>'};
 const recent=settledSignalRows.filter(x=>String(x?.status||'').toUpperCase()==='SETTLED'&&['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'].includes(String(x?.result||'').toUpperCase())).slice().sort((a,b)=>Number(b?.settledAt||b?.createdAt||0)-Number(a?.settledAt||a?.createdAt||0)).slice(0,6);
 const pending=signalRows.filter(x=>String(x?.status||'').toUpperCase()==='PENDING').slice().sort((a,b)=>(num(b?.mirrorMinute??b?.minute??b?.entryMinute)??-1)-(num(a?.mirrorMinute??a?.minute??a?.entryMinute)??-1)||Number(b?.createdAt||0)-Number(a?.createdAt||0)).slice(0,4);
 const makeSettled=x=>{const r=resultMeta(x?.result),score=scoreText(x?.finalScore),odds=num(x?.odds),league=String(x?.league?.name||'').trim();return '<div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-'+esc(r.cls)+'" data-scorebar-signal-result="'+esc(r.label)+'" title="'+esc([league,marketText(x),pickText(x)].filter(Boolean).join(' · '))+'"><span class="workspace-scorebar-meta"><i>'+esc(r.label)+'</i><b>'+esc(score)+'</b></span><span class="workspace-scorebar-match">'+esc(matchText(x))+'</span><span class="workspace-scorebar-pick"><strong>'+esc(marketText(x))+'</strong><em>'+esc(pickText(x))+(odds===null?'':' @ '+esc(odds.toFixed(2)))+'</em></span>'+detailHtml(x,true)+'</div>'};
 const makePending=x=>{const id=String(x?.id||x?.fixtureId||''),minute=num(x?.mirrorMinute??x?.minute??x?.entryMinute),clock='PENDING'+(minute===null?'':' · '+Math.max(0,Math.round(minute))+"'"),score=liveScoreText(x),odds=num(x?.odds),league=String(x?.league?.name||'').trim();return '<div class="workspace-scorebar-cell workspace-scorebar-pending" data-scorebar-pending-signal="'+esc(id)+'" title="'+esc([league,marketText(x),pickText(x)].filter(Boolean).join(' · '))+'"><span class="workspace-scorebar-meta"><i>'+esc(clock)+'</i><b>'+esc(score)+'</b></span><span class="workspace-scorebar-match">'+esc(matchText(x))+'</span><span class="workspace-scorebar-pick"><strong>'+esc(marketText(x))+'</strong><em>'+esc(pickText(x))+(odds===null?'':' @ '+esc(odds.toFixed(2)))+'</em></span>'+detailHtml(x,false)+'</div>'};
 const a=recent.map(makeSettled),b=pending.map(makePending);while(a.length<6)a.push('<div class="workspace-scorebar-cell placeholder"><span>'+(a.length===0?'No settled signals':'—')+'</span><span class="away">—</span></div>');while(b.length<4)b.push('<div class="workspace-scorebar-cell placeholder"><span>'+(b.length===0?'No pending signals':'—')+'</span><span class="away">—</span></div>');slot.innerHTML='<div class="workspace-scorebar-grid">'+a.concat(b).join('')+'</div>';
}'''

js2=js[:s]+new+js[e:]

css_marker='''\n/* BALL46_SCOREBAR_DETAILS_20260929 — add detail row without moving existing score/time row. */
.workspace-scorebar-slot{height:80px;min-height:80px;max-height:80px}
.workspace-scorebar-grid{height:78px}
.workspace-scorebar-cell{height:78px}
.workspace-scorebar-details{display:grid;grid-template-columns:minmax(0,1fr) 26px minmax(0,1fr);align-items:center;gap:3px;margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,.22);font-size:8px;line-height:1.05;white-space:nowrap;min-width:0}
.workspace-scorebar-details>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.workspace-scorebar-detail-entry,.workspace-scorebar-detail-current{display:flex;flex-direction:column;gap:1px}
.workspace-scorebar-detail-current{text-align:right;align-items:flex-end}
.workspace-scorebar-details i{font-style:normal;font-size:7px;font-weight:800;letter-spacing:.35px;opacity:.78}
.workspace-scorebar-details b{font-size:8px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.workspace-scorebar-detail-minute{text-align:center;font-weight:900;font-size:8px;color:#fff}
'''
css2=css.rstrip()+css_marker+'\n'

old_js_ref='dashboard-v2-stage3.js?v=343-scorebar-bg-pending-20260928a'
old_css_ref='singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a'
if idx.count(old_js_ref)!=1: raise SystemExit(f'STOP: JS cache-buster drift: found {idx.count(old_js_ref)} exact refs')
if idx.count(old_css_ref)!=1: raise SystemExit(f'STOP: workspace CSS cache-buster drift: found {idx.count(old_css_ref)} exact refs')
idx2=idx.replace(old_js_ref,'dashboard-v2-stage3.js?v=343-scorebar-details-20260929a')
idx2=idx2.replace(old_css_ref,'singlepage-workspace-343.css?v=343-scorebar-details-20260929a')

# Safety: no production plumbing strings are introduced/removed by this patch.
for token in ['/api/engine/','ENGINE','FULL_MARKET','HUB','workers.dev']:
    if js.count(token)!=js2.count(token): raise SystemExit('STOP: protected wiring token changed in JS: '+token)

JS.write_text(js2,encoding='utf-8')
CSS.write_text(css2,encoding='utf-8')
IDX.write_text(idx2,encoding='utf-8')
print('PATCH_OK')
print('renderer_old_bytes',len(old),'renderer_new_bytes',len(new))
print('css_added_bytes',len(css_marker))
print('index_refs_updated=2')
