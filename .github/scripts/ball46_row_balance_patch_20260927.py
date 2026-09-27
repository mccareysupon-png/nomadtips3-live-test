#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json, time, urllib.request

BASE_INDEX='49082e5c2336bb83e7f2652a9f44c83966f54a024464544c8b690ddf135c5dd5'
BASE_JS_SNAPSHOT='41b896a4dd07e2ff2cffde62247b2db1c407ee4a1b3f739a5c560bce56e90c0e'
BASE_JS_PROD='679b472c504b6d2284a5faf4a64536a570994924abe1a543858a5d392a199262'
BASE_CSS='54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d'
NEW_INDEX='3af8d63d3c3853b99ba83f5dc34c2f3e424845c9c7e36f55f442f4b6b38d4c91'
NEW_JS='d03f0de0d95a477e54a0f1009b4735f721c6e7d1f1b94f0a24dff7c0cf99ba2c'
NEW_CSS='6eedb149043d28aa95296927b0c7002b3752ab98ee3fb9b2778d21fcacc01152'
SNAP=Path('/tmp/pre-mobile')

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p): return sha_bytes(Path(p).read_bytes())
def exact_replace(s, old, new, label):
    n=s.count(old)
    if n != 1: raise SystemExit(f'{label}_TARGET_MISMATCH:{n}')
    return s.replace(old,new,1)

def signal_patch(s):
    reps=[
      ('let signalMap=new Map();','let signalMap=new Map(),signalCount=0;'),
      ("async function loadSignals(){try{const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:[],next=new Map();rows.sort", "async function loadSignals(){try{const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:[],next=new Map();signalCount=rows.length;rows.sort"),
      ('const activeSignals=num(signalMirror?.activeSignals)??signalMap.size,activeMatches=', 'const activeSignals=signalCount,activeMatches='),
    ]
    for i,(a,b) in enumerate(reps): s=exact_replace(s,a,b,f'SIGNAL_{i}')
    return s

OLD_ROW='function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,\'1X2\'),mah=marketCompact(f,\'AH\'),mou=marketCompact(f,\'OU\'),half=halfScoreLabel(f);return `<article class="match-row ${active?\'active\':\'\'}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||\'Home\')} versus ${esc(f?.away?.name||\'Away\')}"><div class="teams-cell"><b>${esc(f?.home?.name||\'—\')}</b><b>${esc(f?.away?.name||\'—\')}</b><small>${esc(detailedStatus(f))}</small></div><div class="score-cell">${scoreStack(f)}<small>${esc(kind===\'live\'?clockLabel(f):kind===\'finished\'?\'FT\':kickoffLabel(f))}</small>${half?`<small class="half-score">${esc(half)}</small>`:\'\'}</div>${marketCell(\'1X2\',m1)}${marketCell(\'AH\',mah)}${marketCell(\'O/U\',mou)}${inlineSignalHtml(sig)}</article>`}'
NEW_ROW='function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,\'1X2\'),mah=marketCompact(f,\'AH\'),mou=marketCompact(f,\'OU\'),half=halfScoreLabel(f),meta=detailedStatus(f);return `<article class="match-row ${active?\'active\':\'\'}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||\'Home\')} versus ${esc(f?.away?.name||\'Away\')}"><div class="teams-cell"><b>${esc(f?.home?.name||\'—\')}</b><b>${esc(f?.away?.name||\'—\')}</b></div><div class="score-cell">${scoreStack(f)}</div><div class="match-meta-cell"><small class="match-clock ${kind===\'live\'?\'live\':\'\'}">${esc(meta)}</small>${half?`<small class="half-score">${esc(half)}</small>`:\'\'}</div>${marketCell(\'1X2\',m1)}${marketCell(\'AH\',mah)}${marketCell(\'O/U\',mou)}${inlineSignalHtml(sig)}</article>`}'

CSS_APPEND='''

/* BALL46 LIVE ROW BALANCE 20260927
   Presentation only. Score remains aligned to the two team rows.
   Live time / FT / kickoff and HT use the previously empty middle area.
   No API, odds, signal, routing, or data mapping changes. */
@media(min-width:901px){
  .match-row{
    grid-template-columns:minmax(250px,1.55fr) 44px minmax(110px,.65fr) repeat(3,minmax(118px,.75fr)) minmax(150px,.95fr);
    gap:8px;
  }
  .teams-cell,.score-cell{
    display:grid;
    grid-template-rows:repeat(2,1.5em);
    align-content:center;
  }
  .teams-cell b,.score-cell strong{
    min-height:1.5em;
    line-height:1.5;
  }
  .score-cell strong{
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:15px;
  }
  .match-meta-cell{
    min-width:0;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:12px;
    white-space:nowrap;
  }
  .match-meta-cell small{
    margin:0;
    color:var(--muted);
    font-size:8px;
    line-height:1;
  }
  .match-meta-cell .match-clock.live{
    color:var(--green);
    font-size:10px;
    font-weight:900;
  }
  .signal-cell.prediction-live{
    align-items:center!important;
    text-align:center;
  }
  .signal-cell.prediction-live .pred-main{
    white-space:normal!important;
    overflow:visible!important;
    text-overflow:clip!important;
    text-align:center;
    line-height:1.15!important;
  }
}

@media(min-width:761px) and (max-width:900px){
  .match-row{
    grid-template-columns:minmax(190px,1.3fr) 40px minmax(84px,.55fr) repeat(3,minmax(96px,.7fr)) minmax(110px,.8fr);
    gap:4px;
  }
  .teams-cell,.score-cell{
    display:grid;
    grid-template-rows:repeat(2,1.5em);
    align-content:center;
  }
  .teams-cell b,.score-cell strong{min-height:1.5em;line-height:1.5}
  .score-cell strong{display:flex;align-items:center;justify-content:center;font-size:14px}
  .match-meta-cell{min-width:0;display:flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}
  .match-meta-cell small{margin:0;color:var(--muted);font-size:7px;line-height:1}
  .match-meta-cell .match-clock.live{color:var(--green);font-size:9px;font-weight:900}
  .signal-cell.prediction-live{align-items:center!important;text-align:center}
  .signal-cell.prediction-live .pred-main{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;text-align:center;line-height:1.12!important}
}

@media(max-width:760px){
  .match-meta-cell{display:none!important}
}
'''

def protected():
    out=[]
    for line in (SNAP/'protected.sha').read_text().splitlines():
        h,n=line.split(None,1); out.append((h,n.strip()))
    return out

def check_local(root, mode):
    root=Path(root)
    expected_index=NEW_INDEX if mode=='new' else BASE_INDEX
    expected_js=NEW_JS if mode=='new' else BASE_JS_PROD
    expected_css=NEW_CSS if mode=='new' else BASE_CSS
    assert sha_file(root/'index.html')==expected_index
    assert sha_file(root/'dashboard-v2-stage3.js')==expected_js
    assert sha_file(root/'dashboard-v2-tune.css')==expected_css
    for h,n in protected():
        if n in ('dashboard-v2-stage3.js','dashboard-v2-tune.css'): continue
        assert sha_file(root/n)==h, n

def do_baseline(root):
    root=Path(root); (root/'ball46-mobile-parity-v1.css').unlink(missing_ok=True)
    p=root/'dashboard-v2-stage3.js'
    assert sha_file(p)==BASE_JS_SNAPSHOT
    p.write_text(signal_patch(p.read_text()))
    check_local(root,'baseline')
    print('BASELINE_PACKAGE_LOCK_PASS')

def do_patch(root):
    root=Path(root); do_baseline(root)
    p=root/'dashboard-v2-stage3.js'
    p.write_text(exact_replace(p.read_text(),OLD_ROW,NEW_ROW,'ROW_HTML'))
    c=root/'dashboard-v2-tune.css'; css=c.read_text()
    if 'BALL46 LIVE ROW BALANCE 20260927' in css: raise SystemExit('CSS_MARKER_EXISTS')
    c.write_text(css+CSS_APPEND)
    i=root/'index.html'; s=i.read_text()
    s=exact_replace(s,'dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width','dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width&layout=20260927-row-balance-v1','INDEX_CSS')
    s=exact_replace(s,'dashboard-v2-stage3.js?v=343-dashboard-v2-stage3-v5-default-rich-bridge&order=20260919-2&signal-owner=dashboard-v1','dashboard-v2-stage3.js?v=343-dashboard-v2-stage3-v5-default-rich-bridge&order=20260919-2&signal-owner=dashboard-v1&layout=20260927-row-balance-v1','INDEX_JS')
    i.write_text(s)
    check_local(root,'new')
    print('ROW_BALANCE_PACKAGE_LOCK_PASS')

def fetch(url):
    err=None
    for _ in range(4):
        try:
            req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'ball46-row-balance-verify'})
            with urllib.request.urlopen(req,timeout=25) as r: return r.read()
        except Exception as e:
            err=e; time.sleep(2)
    raise err

def remote_check(worker, mode):
    worker=worker.rstrip('/'); tag=f'{mode}-{time.time_ns()}'
    exp_index=NEW_INDEX if mode=='new' else BASE_INDEX
    exp_js=NEW_JS if mode=='new' else BASE_JS_PROD
    exp_css=NEW_CSS if mode=='new' else BASE_CSS
    index=fetch(f'{worker}/index.html?verify={tag}')
    assert sha_bytes(index)==exp_index, 'INDEX_HASH_BAD'
    assert b'BALL46-MOBILE-PARITY' not in index
    for h,n in protected():
        b=fetch(f'{worker}/{n}?verify={tag}')
        exp=exp_js if n=='dashboard-v2-stage3.js' else exp_css if n=='dashboard-v2-tune.css' else h
        assert sha_bytes(b)==exp, f'ASSET_HASH_BAD:{n}'
    if mode=='new':
        assert b'layout=20260927-row-balance-v1' in index
        assert b'class="match-meta-cell"' in fetch(f'{worker}/dashboard-v2-stage3.js?verify2={tag}')
        assert b'BALL46 LIVE ROW BALANCE 20260927' in fetch(f'{worker}/dashboard-v2-tune.css?verify2={tag}')
    for page in ('signal.html','statistics.html'):
        assert fetch(f'{worker}/{page}?verify={tag}'), f'EMPTY:{page}'
    h=json.loads(fetch(f'{worker}/api/engine/health?verify={tag}'))
    b=json.loads(fetch(f'{worker}/api/engine/board?verify={tag}'))
    s=json.loads(fetch(f'{worker}/api/engine/signals?verify={tag}'))
    t=json.loads(fetch(f'{worker}/api/engine/statistics?verify={tag}'))
    assert h.get('ok') is True
    assert b.get('ok') is True and isinstance(b.get('fixtures'),list)
    assert isinstance(s.get('signals'),list)
    assert t.get('ok') is True and isinstance(t.get('rows'),list)
    print('REMOTE_LOCK_PASS',mode,{'fixtures':len(b['fixtures']),'signals':len(s['signals']),'settled':len(t['rows'])})

def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest='cmd',required=True)
    for c in ('patch','baseline'):
        p=sub.add_parser(c); p.add_argument('root')
    p=sub.add_parser('remote-check'); p.add_argument('worker'); p.add_argument('mode',choices=('baseline','new'))
    a=ap.parse_args()
    if a.cmd=='patch': do_patch(a.root)
    elif a.cmd=='baseline': do_baseline(a.root)
    else: remote_check(a.worker,a.mode)
if __name__=='__main__': main()
