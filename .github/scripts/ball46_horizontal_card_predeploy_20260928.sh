#!/usr/bin/env bash
set -euo pipefail
WORKER='ball46-production'
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='f3476eaa-51e8-41ce-ac71-ccce20c09ce9'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
BASE='/tmp/b46-current/candidate'
ROOT='/tmp/b46-horizontal-predeploy'
CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; PREVIEW="$ROOT/preview"
rm -rf "$ROOT"; mkdir -p "$CAND" "$VERIFY" "$PREVIEW"
[ -d "$BASE" ] || { echo BASE_ARTIFACT_MISSING; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-horizontal-predeploy');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='f3476eaa-51e8-41ce-ac71-ccce20c09ce9': raise SystemExit('PRODUCTION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; ex={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in ex}!=ex: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
root.joinpath('production-lock.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha,'bindings':got,'assets_config':ac},indent=2))
print('PRODUCTION_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-mirror-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$ROOT/live/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$ROOT/live/$rel" -w '%{http_code}' "$DIRECT/$rel?hcardmirror=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_FETCH_FAILED:$code:$rel"; exit 1; }
  cmp -s "$ROOT/live/$rel" "$BASE/$rel" || { echo "BASE_NOT_CURRENT_PRODUCTION:$rel"; exit 1; }
done < <(cd "$BASE" && find . -type f -printf '%P\n' | sort)
echo CURRENT_79_MATCH_LOCKED_BASE

cp -a "$BASE/." "$CAND/"
python3 - <<'PY'
from pathlib import Path
root=Path('/tmp/b46-horizontal-predeploy/candidate')
js=root/'dashboard-v2-stage3.js'; s=js.read_text(); lines=s.splitlines(True)
idx=[i for i,x in enumerate(lines) if x.startswith('function rowHtml(f){')]
if len(idx)!=1: raise SystemExit('ROWHTML_COUNT_BAD:'+str(len(idx)))
old_line=lines[idx[0]].rstrip('\n')
if 'class="teams-cell"><b>' not in old_line or '${scoreStack(f)}' not in old_line: raise SystemExit('ROWHTML_BASE_SHAPE_BAD')
new_line='''function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,'1X2'),mah=marketCompact(f,'AH'),mou=marketCompact(f,'OU'),half=halfScoreLabel(f),pair=scorePair(f),homeScore=kind==='scheduled'?'—':pair.home===null?'—':show(pair.home),awayScore=kind==='scheduled'?'—':pair.away===null?'—':show(pair.away),clock=kind==='live'?`LIVE · ${clockLabel(f)}`:kind==='finished'?'FT':kickoffLabel(f);return `<article class="match-row ${active?'active':''}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}"><div class="teams-cell"><b>${esc(f?.home?.name||'—')}</b><strong class="desktop-team-score" aria-hidden="true">${esc(homeScore)}</strong><b>${esc(f?.away?.name||'—')}</b><strong class="desktop-team-score" aria-hidden="true">${esc(awayScore)}</strong></div><div class="score-cell">${scoreStack(f)}<small>${esc(clock)}</small>${half?`<small class="half-score">${esc(half)}</small>`:''}</div>${marketCell('1X2',m1)}${marketCell('AH',mah)}${marketCell('O/U',mou)}${inlineSignalHtml(sig)}</article>`}'''
lines[idx[0]]=new_line+'\n'; js.write_text(''.join(lines))

css=root/'dashboard-v2-tune.css'; c=css.read_text(); marker='/* BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928 */'
if c.count(marker)!=1: raise SystemExit('STEP6_MARKER_COUNT_BAD:'+str(c.count(marker)))
start=c.index(marker)
new_tail=r'''/* BALL46 HORIZONTAL CARD BALANCE 20260928 */
.desktop-team-score{display:none}
@media (min-width:761px){
  .match-row{grid-template-columns:minmax(0,29fr) minmax(0,14fr) minmax(0,14fr) minmax(0,14fr) minmax(0,13fr) minmax(0,16fr)!important;gap:6px!important}
  .match-row .teams-cell{min-width:0;height:42px;display:grid;grid-template-columns:minmax(0,1fr) 30px;grid-template-rows:repeat(2,minmax(0,1fr));column-gap:8px;align-items:center}
  .match-row .teams-cell>b{min-width:0;margin:0;line-height:1.15;align-self:center}
  .match-row .teams-cell>.desktop-team-score{display:block;min-width:0;margin:0;text-align:center;font-size:16px;font-weight:900;line-height:1;align-self:center}
  .match-row .teams-cell>b:nth-of-type(1){grid-column:1;grid-row:1}.match-row .teams-cell>.desktop-team-score:nth-of-type(1){grid-column:2;grid-row:1}
  .match-row .teams-cell>b:nth-of-type(2){grid-column:1;grid-row:2}.match-row .teams-cell>.desktop-team-score:nth-of-type(2){grid-column:2;grid-row:2}
  .match-row .score-cell{min-width:0;height:42px;display:grid;grid-template-rows:repeat(2,minmax(0,1fr));align-items:center;justify-items:center;text-align:center;position:relative;padding-left:6px;border-left:1px solid var(--line)}
  .match-row .score-cell>strong{display:none!important}
  .match-row .score-cell>small:not(.half-score){grid-row:1 / span 2;align-self:center;margin:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:9px;font-weight:900;line-height:1.05}
  .match-row .score-cell:has(.half-score)>small:not(.half-score){grid-row:1;align-self:end;padding-bottom:2px}
  .match-row .score-cell>.half-score{grid-row:2;align-self:start;margin:0;padding-top:2px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:8px;line-height:1.05}
  .match-row .market-cell,.match-row .signal-cell.prediction-live{min-width:0}
  .match-row .signal-cell.prediction-live{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 5px 0 8px;border-left:1px solid var(--line)}
  .match-row .signal-cell.prediction-live .pred-main{display:block;width:100%;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;text-align:center;font-size:8px;line-height:1.18}
  .match-row .signal-cell.prediction-live .pred-sub{display:block;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:7px;line-height:1.05}
}
@media (min-width:761px) and (max-width:980px){
  .match-row{grid-template-columns:minmax(0,30fr) minmax(0,15fr) minmax(0,14fr) minmax(0,14fr) minmax(0,12fr) minmax(0,15fr)!important;gap:4px!important}
  .match-row .teams-cell{grid-template-columns:minmax(0,1fr) 26px;column-gap:6px}.match-row .teams-cell>.desktop-team-score{font-size:15px}
  .match-row .score-cell{padding-left:4px}.match-row .score-cell>small:not(.half-score){font-size:8px}.match-row .score-cell>.half-score{font-size:7px}.match-row .signal-cell.prediction-live{padding-left:6px}
}
'''
css.write_text(c[:start].rstrip()+'\n\n'+new_tail)
html=root/'index.html'; h=html.read_text(); pairs=[('dashboard-v2-tune.css?v=343-card-step6-20260928a','dashboard-v2-tune.css?v=343-horizontal-card-20260928a'),('dashboard-v2-stage3.js?v=343-market-detail-20260922a','dashboard-v2-stage3.js?v=343-horizontal-card-20260928a')]
for old,new in pairs:
  if h.count(old)!=1: raise SystemExit('INDEX_REF_COUNT_BAD:'+old+':'+str(h.count(old)))
  h=h.replace(old,new,1)
html.write_text(h)
print('PATCH_BUILT')
PY

python3 - <<'PY'
from pathlib import Path
import hashlib,difflib
base=Path('/tmp/b46-current/candidate');cand=Path('/tmp/b46-horizontal-predeploy/candidate')
paths=sorted(p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file());changed=[]
for rel in paths:
  if hashlib.sha256((base/rel).read_bytes()).digest()!=hashlib.sha256((cand/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS',changed)
if changed!=['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']: raise SystemExit('THREE_FILE_GATE_BAD:'+repr(changed))
a=(base/'dashboard-v2-stage3.js').read_text().splitlines();b=(cand/'dashboard-v2-stage3.js').read_text().splitlines();ops=[x for x in difflib.SequenceMatcher(a=a,b=b).get_opcodes() if x[0]!='equal']
if len(ops)!=1 or ops[0][0]!='replace' or ops[0][2]-ops[0][1]!=1 or ops[0][4]-ops[0][3]!=1 or not a[ops[0][1]].startswith('function rowHtml(f){') or not b[ops[0][3]].startswith('function rowHtml(f){'): raise SystemExit('JS_DIFF_NOT_ROWHTML_ONLY:'+repr(ops))
old=(base/'dashboard-v2-tune.css').read_text();new=(cand/'dashboard-v2-tune.css').read_text();om='/* BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928 */';nm='/* BALL46 HORIZONTAL CARD BALANCE 20260928 */'
if old[:old.index(om)].rstrip()!=new[:new.index(nm)].rstrip(): raise SystemExit('CSS_PREFIX_CHANGED')
newi=(cand/'index.html').read_text();basei=(base/'index.html').read_text();rev=newi.replace('dashboard-v2-tune.css?v=343-horizontal-card-20260928a','dashboard-v2-tune.css?v=343-card-step6-20260928a').replace('dashboard-v2-stage3.js?v=343-horizontal-card-20260928a','dashboard-v2-stage3.js?v=343-market-detail-20260922a')
if rev!=basei: raise SystemExit('INDEX_DIFF_NOT_TWO_REFS')
for rel in changed: print('CAND_SHA',rel,hashlib.sha256((cand/rel).read_bytes()).hexdigest())
print('SURGICAL_DIFF_GATE_PASS')
PY

nonce="${GITHUB_RUN_ID:-manual}-health-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?hcard=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-horizontal-predeploy/verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('API_HEALTH_BAD:'+n)
print('API_HEALTH_PASS')
PY

mkdir -p "$PREVIEW/before" "$PREVIEW/after"
cp "$BASE/dashboard-v2.css" "$PREVIEW/before/dashboard-v2.css"; cp "$BASE/dashboard-v2-tune.css" "$PREVIEW/before/dashboard-v2-tune.css"
cp "$CAND/dashboard-v2.css" "$PREVIEW/after/dashboard-v2.css"; cp "$CAND/dashboard-v2-tune.css" "$PREVIEW/after/dashboard-v2-tune.css"
cat > "$PREVIEW/before/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="dashboard-v2.css"><link rel="stylesheet" href="dashboard-v2-tune.css"><article class="match-row"><div class="teams-cell"><b>Manchester City</b><b>Arsenal</b></div><div class="score-cell"><strong>2</strong><strong>1</strong><small>70'</small><small class="half-score">HT 1-0</small></div><div class="market-cell"><span>1X2</span><b>1.85</b></div><div class="market-cell"><span>AH</span><b>-0.5 · 1.92</b></div><div class="market-cell"><span>O/U</span><b>O2.5 · 1.88</b></div><div class="signal-cell prediction-live"><span class="pred-main">HOME AH -0.5</span><span class="pred-sub">LOCKED</span></div></article>
HTML
cat > "$PREVIEW/after/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="dashboard-v2.css"><link rel="stylesheet" href="dashboard-v2-tune.css"><article class="match-row"><div class="teams-cell"><b>Manchester City</b><strong class="desktop-team-score" aria-hidden="true">2</strong><b>Arsenal</b><strong class="desktop-team-score" aria-hidden="true">1</strong></div><div class="score-cell"><strong>2</strong><strong>1</strong><small>LIVE · 70'</small><small class="half-score">HT 1-0</small></div><div class="market-cell"><span>1X2</span><b>1.85</b></div><div class="market-cell"><span>AH</span><b>-0.5 · 1.92</b></div><div class="market-cell"><span>O/U</span><b>O2.5 · 1.88</b></div><div class="signal-cell prediction-live"><span class="pred-main">HOME AH -0.5</span><span class="pred-sub">LOCKED</span></div></article>
HTML
(cd "$PREVIEW" && python3 -m http.server 8123 >server.log 2>&1 & echo $! > server.pid)
sleep 1
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9223 --user-data-dir="$PREVIEW/chrome" http://127.0.0.1:8123/after/index.html >"$PREVIEW/chrome.log" 2>&1 & CPID=$!; trap 'kill $CPID 2>/dev/null || true; kill $(cat "$PREVIEW/server.pid" 2>/dev/null) 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9223/json > "$PREVIEW/pages.json" 2>/dev/null && break; sleep 1; done
test -s "$PREVIEW/pages.json"
cat > "$PREVIEW/check.js" <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-horizontal-predeploy/preview/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0;const q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(expression){const z=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function load(url,w,h){await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url});await sleep(700);return ev(`(()=>{const r=document.querySelector('.match-row'),t=r.querySelector('.teams-cell'),sc=r.querySelector('.score-cell'),mk=[...r.querySelectorAll('.market-cell')],sg=r.querySelector('.signal-cell'),names=[...t.querySelectorAll('b')],ds=[...t.querySelectorAll('.desktop-team-score')],orig=[...sc.querySelectorAll('strong')],clock=sc.querySelector('small:not(.half-score)'),half=sc.querySelector('.half-score'),c=x=>{const a=x.getBoundingClientRect(),cs=getComputedStyle(x);return {w:a.width,h:a.height,cy:a.y+a.height/2,display:cs.display,visible:cs.display!=='none'&&a.width>0&&a.height>0}};return {row:c(r),team:c(t),time:c(sc),markets:mk.map(c),signal:c(sg),names:names.map(c),desktopScores:ds.map(c),originalScores:orig.map(c),clock:c(clock),half:c(half),overflow:r.scrollWidth>r.clientWidth+1}})()`)};(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');const before=await load('http://127.0.0.1:8123/before/index.html',1440,900);const after=await load('http://127.0.0.1:8123/after/index.html',1440,900);const mobile=await load('http://127.0.0.1:8123/after/index.html',390,850);const sum=[after.team,after.time,...after.markets,after.signal].reduce((a,x)=>a+x.w,0),ratios={team:after.team.w/sum,time:after.time.w/sum,m1:after.markets[0].w/sum,ah:after.markets[1].w/sum,ou:after.markets[2].w/sum,signal:after.signal.w/sum},align=Math.max(...after.names.map((x,i)=>Math.abs(x.cy-after.desktopScores[i].cy))),out={before,after,mobile,ratios,align,heightDelta:Math.abs(after.row.h-before.row.h)};console.log('PREVIEW',JSON.stringify(out));if(after.overflow||mobile.overflow)throw Error('OVERFLOW');if(out.heightDelta>1.5)throw Error('HEIGHT_CHANGED');if(align>3)throw Error('TEAM_SCORE_ALIGN');if(after.originalScores.some(x=>x.visible)||after.desktopScores.some(x=>!x.visible)||!after.clock.visible||!after.half.visible)throw Error('DESKTOP_VISIBILITY_BAD');if(mobile.desktopScores.some(x=>x.visible)||mobile.originalScores.some(x=>!x.visible)||mobile.markets.some(x=>x.visible))throw Error('MOBILE_REGRESSION');if(!(ratios.team>=.28&&ratios.team<=.32&&ratios.time>=.12&&ratios.time<=.16&&ratios.m1>=.13&&ratios.m1<=.16&&ratios.ah>=.13&&ratios.ah<=.16&&ratios.ou>=.11&&ratios.ou<=.15&&ratios.signal>=.14&&ratios.signal<=.18))throw Error('RATIO_BAD:'+JSON.stringify(ratios));fs.writeFileSync('/tmp/b46-horizontal-predeploy/preview/result.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
node "$PREVIEW/check.js"
kill "$CPID" 2>/dev/null || true; kill $(cat "$PREVIEW/server.pid") 2>/dev/null || true; trap - EXIT

echo HORIZONTAL_CARD_PREDEPLOY_SUCCESS_NO_DEPLOY
