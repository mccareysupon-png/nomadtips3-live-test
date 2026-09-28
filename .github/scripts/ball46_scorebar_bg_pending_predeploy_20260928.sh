#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_VERSION='9d68b06d-2f83-4b0f-958a-d4b0babf1857'
EXPECTED_RUNTIME='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
SRC='/tmp/b46-v5'
ROOT='/tmp/b46-bg-pending'
BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
rm -rf "$ROOT"; mkdir -p "$ROOT" "$VERIFY" "$RUNTIME"
[ -d "$SRC/candidate" ] || { echo V5_CANDIDATE_MISSING; exit 1; }
[ -s "$SRC/paths.txt" ] || { echo V5_PATHS_MISSING; exit 1; }
cp -a "$SRC/candidate" "$BASE"
cp -a "$SRC/candidate" "$CAND"
cp "$SRC/paths.txt" "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo BASE_NOT_79; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CAND_NOT_79; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-bg-pending/runtime');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
if vid!='9d68b06d-2f83-4b0f-958a-d4b0babf1857': raise SystemExit('VERSION_MOVED:'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_BAD:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
ss=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=ss.get('schedules',[]) if isinstance(ss,dict) else (ss or []);cr=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if cr!=['* * * * *']: raise SystemExit('CRON_BAD:'+repr(cr))
(root/'index.js').write_bytes(runtime);print('PRODUCTION_LOCK_PASS',vid,sha)
PY

python3 - <<'PY'
from pathlib import Path
import hashlib,re
root=Path('/tmp/b46-bg-pending');c=root/'candidate'
js_p=c/'dashboard-v2-stage3.js'; css_p=c/'singlepage-workspace-343.css'; idx_p=c/'index.html'
js=js_p.read_text();css=css_p.read_text();idx=idx_p.read_text()
start='/* BALL46_SCOREBAR_SIGNAL_SETTLEMENT_20260928 — first 6 = latest settled Ball46 predictions; last 4 = same near-FT live matches */\nfunction renderWorkspaceScorebar(){'
end='\n}\ndocument.addEventListener(\'ball46:stable-chrome-ready\',renderWorkspaceScorebar);'
i=js.find(start); j=js.find(end,i)
if i<0 or j<0: raise SystemExit('SCOREBAR_BLOCK_NOT_FOUND')
new='''/* BALL46_SCOREBAR_SIGNAL_FLOW_20260928 — first 6 = latest settled Ball46 predictions; last 4 = active PENDING Ball46 signals only */
function renderWorkspaceScorebar(){
 const slot=document.querySelector('[data-workspace-scorebar-slot]');if(!slot)return;
 const resultMeta=raw=>{const r=String(raw||'').trim().toUpperCase();if(r==='WIN')return{cls:'win',label:'WIN'};if(r==='HALF_WIN')return{cls:'win',label:'WIN ½'};if(r==='LOSS')return{cls:'loss',label:'LOSS'};if(r==='HALF_LOSS')return{cls:'loss',label:'LOSS ½'};if(r==='PUSH'||r==='DRAW')return{cls:'draw',label:'DRAW'};return{cls:'draw',label:r||'DRAW'}};
 const scoreText=v=>{const p=pair(v);return p.home===null||p.away===null?'—':show(p.home)+'–'+show(p.away)};
 const liveScoreText=x=>scoreText(x?.mirrorScore??x?.scoreAt??x?.entryScore);
 const lineText=x=>{const n=num(x?.line??x?.selectionLine);if(n===null)return'';const m=String(x?.market||x?.marketLabel||'').toLowerCase();return(/ah|handicap/.test(m)&&n>0?'+':'')+show(n,2)};
 const pickText=x=>[String(x?.selection||'').trim().toUpperCase(),lineText(x)].filter(Boolean).join(' ')||'SIGNAL';
 const marketText=x=>String(x?.marketLabel||x?.market||'SIGNAL').replaceAll('_',' ').replace(/\\s+/g,' ').trim();
 const matchText=x=>[x?.home?.name,x?.away?.name].filter(Boolean).join(' · ')||'—';
 const recent=settledSignalRows.filter(x=>String(x?.status||'').toUpperCase()==='SETTLED'&&['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'].includes(String(x?.result||'').toUpperCase())).slice().sort((a,b)=>Number(b?.settledAt||b?.createdAt||0)-Number(a?.settledAt||a?.createdAt||0)).slice(0,6);
 const pending=signalRows.filter(x=>String(x?.status||'').toUpperCase()==='PENDING').slice().sort((a,b)=>(num(b?.mirrorMinute??b?.minute??b?.entryMinute)??-1)-(num(a?.mirrorMinute??a?.minute??a?.entryMinute)??-1)||Number(b?.createdAt||0)-Number(a?.createdAt||0)).slice(0,4);
 const makeSettled=x=>{const r=resultMeta(x?.result),score=scoreText(x?.finalScore),odds=num(x?.odds),league=String(x?.league?.name||'').trim();return '<div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-'+esc(r.cls)+'" data-scorebar-signal-result="'+esc(r.label)+'" title="'+esc([league,marketText(x),pickText(x)].filter(Boolean).join(' · '))+'"><span class="workspace-scorebar-meta"><i>'+esc(r.label)+'</i><b>'+esc(score)+'</b></span><span class="workspace-scorebar-match">'+esc(matchText(x))+'</span><span class="workspace-scorebar-pick"><strong>'+esc(marketText(x))+'</strong><em>'+esc(pickText(x))+(odds===null?'':' @ '+esc(odds.toFixed(2)))+'</em></span></div>'};
 const makePending=x=>{const id=String(x?.id||x?.fixtureId||''),minute=num(x?.mirrorMinute??x?.minute??x?.entryMinute),clock='PENDING'+(minute===null?'':' · '+Math.max(0,Math.round(minute))+"'"),score=liveScoreText(x),odds=num(x?.odds),league=String(x?.league?.name||'').trim();return '<div class="workspace-scorebar-cell workspace-scorebar-pending" data-scorebar-pending-signal="'+esc(id)+'" title="'+esc([league,marketText(x),pickText(x)].filter(Boolean).join(' · '))+'"><span class="workspace-scorebar-meta"><i>'+esc(clock)+'</i><b>'+esc(score)+'</b></span><span class="workspace-scorebar-match">'+esc(matchText(x))+'</span><span class="workspace-scorebar-pick"><strong>'+esc(marketText(x))+'</strong><em>'+esc(pickText(x))+(odds===null?'':' @ '+esc(odds.toFixed(2)))+'</em></span></div>'};
 const a=recent.map(makeSettled),b=pending.map(makePending);while(a.length<6)a.push('<div class="workspace-scorebar-cell placeholder"><span>'+(a.length===0?'No settled signals':'—')+'</span><span class="away">—</span></div>');while(b.length<4)b.push('<div class="workspace-scorebar-cell placeholder"><span>'+(b.length===0?'No pending signals':'—')+'</span><span class="away">—</span></div>');slot.innerHTML='<div class="workspace-scorebar-grid">'+a.concat(b).join('')+'</div>';
}'''
js=js[:i]+new+js[j+2:]
js_p.write_text(js)

b64={k:Path(f'.github/fixtures/scorebar-{k}-20260928.b64').read_text().strip() for k in ('win','loss','draw')}
for k,v in b64.items():
 if not v.startswith('UklGR'): raise SystemExit('BAD_IMAGE_B64:'+k)
repls={
'win':f'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win{{background-color:#103A24;background-image:linear-gradient(90deg,rgba(6,24,14,.62),rgba(6,24,14,.36)),url("data:image/webp;base64,{b64["win"]}")}}',
'loss':f'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{{background-color:#3B1212;background-image:linear-gradient(90deg,rgba(25,5,5,.66),rgba(25,5,5,.38)),url("data:image/webp;base64,{b64["loss"]}")}}',
'draw':f'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw{{background-color:#2F343C;background-image:linear-gradient(90deg,rgba(16,20,25,.60),rgba(16,20,25,.34)),url("data:image/webp;base64,{b64["draw"]}")}}'}
for k,r in repls.items():
 pat=rf'\.workspace-scorebar-cell\.workspace-scorebar-signal-result\.outcome-{k}\{{[^\n]*\}}'
 css,n=re.subn(pat,r,css,count=1)
 if n!=1: raise SystemExit('CSS_RESULT_REPLACE_FAIL:'+k)
css=css.replace('.workspace-scorebar-cell.workspace-scorebar-signal-result,.workspace-scorebar-cell.workspace-scorebar-live{','.workspace-scorebar-cell.workspace-scorebar-signal-result,.workspace-scorebar-cell.workspace-scorebar-pending{',1)
css=css.replace('.workspace-scorebar-cell.workspace-scorebar-live{background-color:#132A46','.workspace-scorebar-cell.workspace-scorebar-pending{background-color:#132A46',1).replace('.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-meta i','.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-meta i').replace('.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-meta b','.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-meta b').replace('.workspace-scorebar-cell.workspace-scorebar-live .workspace-scorebar-team.live','.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-team.live')
css+='''\n/* BALL46_SCOREBAR_GENERATED_BACKGROUNDS_PENDING_20260928 */
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-match{font-size:7px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#E0F2FE;margin:1px 0}.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick{display:flex;flex-direction:column;min-width:0;line-height:9px}.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick strong,.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick em{font-size:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick strong{color:#BAE6FD;font-weight:900}.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick em{color:#F0F9FF;font-style:normal;font-weight:800}.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-meta i{font-size:6px;font-weight:950;color:#7DD3FC}\n'''
css_p.write_text(css)
idx=idx.replace('343-signal-settlement-20260928a','343-scorebar-bg-pending-20260928a')
idx_p.write_text(idx)

paths=[x.strip() for x in (root/'paths.txt').read_text().splitlines() if x.strip()];changed=[]
for p in paths:
 a=root/'base'/p;b=root/'candidate'/p
 if hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest():changed.append(p)
print('CHANGED_ASSETS',changed)
want=['dashboard-v2-stage3.js','index.html','singlepage-workspace-343.css']
if sorted(changed)!=sorted(want): raise SystemExit('BAD_DIFF:'+repr(changed))
for p in want:print('CAND_SHA',p,hashlib.sha256((root/'candidate'/p).read_bytes()).hexdigest())
for m in ['BALL46_SCOREBAR_SIGNAL_FLOW_20260928','data-scorebar-pending-signal','No pending signals']:
 if m not in js: raise SystemExit('JS_MARKER_MISSING:'+m)
for m in ['data:image/webp;base64','BALL46_SCOREBAR_GENERATED_BACKGROUNDS_PENDING_20260928','workspace-scorebar-pending']:
 if m not in css: raise SystemExit('CSS_MARKER_MISSING:'+m)
if '343-scorebar-bg-pending-20260928a' not in idx: raise SystemExit('BUSTER_MISSING')
print('THREE_FILE_PATCH_GATE_PASS')
PY
node --check "$CAND/dashboard-v2-stage3.js"

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?pre=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-bg-pending/verify')
b=json.load(open(r/'board.json'));s=json.load(open(r/'signals.json'));t=json.load(open(r/'statistics.json'))
if b.get('ok') is not True or s.get('ok') is not True or t.get('ok') is not True: raise SystemExit('API_NOT_OK')
allowed={'WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','DRAW'}
settled=[x for x in t.get('rows',[]) if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in allowed];settled.sort(key=lambda x:x.get('settledAt') or x.get('createdAt') or 0,reverse=True)
pending=[x for x in s.get('signals',[]) if str(x.get('status','')).upper()=='PENDING'];pending.sort(key=lambda x:(x.get('mirrorMinute') if x.get('mirrorMinute') is not None else x.get('minute') if x.get('minute') is not None else x.get('entryMinute') if x.get('entryMinute') is not None else -1,x.get('createdAt') or 0),reverse=True)
(r/'expected.json').write_text(json.dumps({'settled':settled[:6],'pending':pending[:4]},ensure_ascii=False,indent=2))
print('DATA_TRUTH_PASS',{'settled':len(settled),'pending':len(pending),'fixtures':len(b.get('fixtures',[]))})
if pending: print('PENDING_SAMPLE',json.dumps({k:pending[0].get(k) for k in ['id','marketLabel','market','selection','line','selectionLine','odds','entryMinute','minute','mirrorMinute','mirrorScore','status']},ensure_ascii=False))
PY

cat > "$VERIFY/server.py" <<'PY'
import http.server, pathlib, urllib.parse, json, os
ROOT=pathlib.Path('/tmp/b46-bg-pending/candidate'); SNAP=pathlib.Path('/tmp/b46-bg-pending/verify')
class H(http.server.SimpleHTTPRequestHandler):
 def translate_path(self,path):
  p=urllib.parse.urlparse(path).path
  return str(ROOT/(p.lstrip('/') or 'index.html'))
 def do_GET(self):
  p=urllib.parse.urlparse(self.path).path
  m={'/api/engine/board':'board.json','/api/engine/signals':'signals.json','/api/engine/statistics':'statistics.json'}
  if p in m:
   data=(SNAP/m[p]).read_bytes();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  return super().do_GET()
 def log_message(self,fmt,*args): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8777),H).serve_forever()
PY
python3 "$VERIFY/server.py" >"$VERIFY/server.log" 2>&1 & SPID=$!; trap 'kill ${SPID:-0} ${CPID:-0} 2>/dev/null || true' EXIT
for i in $(seq 1 30);do curl -fsS http://127.0.0.1:8777/ >/dev/null 2>&1&&break;sleep .2;done
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true);[ -n "$chrome" ]||{ echo CHROME_MISSING;exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9777 --user-data-dir="$VERIFY/chrome" 'http://127.0.0.1:8777/?pre=1' >"$VERIFY/chrome.log" 2>&1 & CPID=$!
for i in $(seq 1 80);do curl -fsS http://127.0.0.1:9777/json >"$VERIFY/pages.tmp" 2>/dev/null&&python3 -c "import json;x=json.load(open('$VERIFY/pages.tmp'));assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null&&{ mv "$VERIFY/pages.tmp" "$VERIFY/pages.json";break;};sleep .5;done
[ -s "$VERIFY/pages.json" ]||{ echo CDP_NOT_READY;exit 1; }
cat > "$VERIFY/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-bg-pending/verify/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl),exp=JSON.parse(fs.readFileSync('/tmp/b46-bg-pending/verify/expected.json'));if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))}),sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}async function wait(x,t=45000){const s=Date.now();while(Date.now()-s<t){try{if(await ev(x))return}catch{}await sleep(250)}throw Error('WAIT '+x)}const map=r=>r==='WIN'?'WIN':r==='HALF_WIN'?'WIN ½':r==='LOSS'?'LOSS':r==='HALF_LOSS'?'LOSS ½':(r==='PUSH'||r==='DRAW')?'DRAW':r;const num=x=>{const n=Number(x);return Number.isFinite(n)?n:null};const line=x=>{const n=num(x.line??x.selectionLine);if(n===null)return'';const m=String(x.market||x.marketLabel||'').toLowerCase();return(/ah|handicap/.test(m)&&n>0?'+':'')+String(n)};const pick=x=>[String(x.selection||'').trim().toUpperCase(),line(x)].filter(Boolean).join(' ')||'SIGNAL';(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');await wait(`document.readyState==='complete'`);await wait(`document.querySelectorAll('[data-scorebar-signal-result]').length===6`);await sleep(1200);const d=await ev(`(()=>{const g=document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid'),c=g?[...g.children]:[];return{count:c.length,left:c.slice(0,6).map(x=>({result:x.getAttribute('data-scorebar-signal-result')||'',bg:getComputedStyle(x).backgroundImage,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height,text:x.innerText})),right:c.slice(6).map(x=>({pending:x.hasAttribute('data-scorebar-pending-signal'),id:x.getAttribute('data-scorebar-pending-signal')||'',placeholder:x.classList.contains('placeholder'),live:x.classList.contains('workspace-scorebar-live'),text:x.innerText,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height})),slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}})()`);if(d.count!==10)throw Error('COUNT_'+d.count);const wantL=exp.settled.map(x=>map(String(x.result||'').toUpperCase()));if(JSON.stringify(d.left.map(x=>x.result))!==JSON.stringify(wantL))throw Error('LEFT_RESULT_MISMATCH');for(const x of d.left){if(!x.bg.includes('data:image/webp;base64'))throw Error('LEFT_IMAGE_MISSING');if(Math.abs(x.h-58)>.5)throw Error('LEFT_HEIGHT_'+x.h)}const real=d.right.filter(x=>x.pending),want=exp.pending.map(x=>String(x.id||x.fixtureId||''));if(JSON.stringify(real.map(x=>x.id))!==JSON.stringify(want))throw Error('PENDING_IDS_MISMATCH '+JSON.stringify({got:real.map(x=>x.id),want}));if(d.right.some(x=>x.live))throw Error('GENERIC_LIVE_LEAK');if(d.right.filter(x=>x.placeholder).length!==4-want.length)throw Error('PLACEHOLDER_COUNT');for(let i=0;i<real.length;i++){const x=real[i],s=exp.pending[i];if(!x.text.includes(String(s.marketLabel||s.market||''))||!x.text.includes(String(s.selection||'').toUpperCase())||!x.text.includes('PENDING'))throw Error('PENDING_DETAIL_'+i);if(Math.abs(x.h-58)>.5)throw Error('PENDING_HEIGHT_'+x.h)}if(!d.odds||!d.favicon||d.overflow)throw Error('DESKTOP_REGRESSION');await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:false});await call('Page.reload',{ignoreCache:true});await wait(`document.readyState==='complete'`);await sleep(2500);const m=await ev(`(()=>({slot:getComputedStyle(document.querySelector('[data-workspace-scorebar-slot]')).display,odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);if(m.slot!=='none'||!m.odds||!m.favicon||m.overflow)throw Error('MOBILE_REGRESSION');console.log('CANDIDATE_BROWSER_PASS',JSON.stringify({left:wantL,pending:want,placeholders:4-want.length,width:d.left[0]?.w,height:d.left[0]?.h,mobile:m.slot}));fs.writeFileSync('/tmp/b46-bg-pending/verify/browser.json',JSON.stringify({desktop:d,mobile:m},null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$VERIFY/check.js"
kill "$CPID" "$SPID" 2>/dev/null || true; trap - EXIT

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
[ "$(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\n'|sort|paste -sd, -)" = 'index.js,wrangler.jsonc' ]||{ echo RUNTIME_DIR_BAD;exit 1; }
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1)|tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log"||{ echo DRY_NOT_79;exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log"||{ echo DRY_EXTRA_MODULES;exit 1; }
echo BALL46_BG_PENDING_PREDEPLOY_SUCCESS_NO_DEPLOY
