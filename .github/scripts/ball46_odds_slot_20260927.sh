#!/usr/bin/env bash
set -euo pipefail

WWW="https://www.ball46.com"
PATH_SOURCE_SHA="6276320261cdc10a3835b27e81850c3d4f17f126"
ODDS_TOKEN="343-odds-format-under-logo-20260927a"

rm -rf /tmp/b46-assets /tmp/b46-before /tmp/b46-runtime /tmp/b46-after /tmp/b46-backup /tmp/screens /tmp/chrome-odds
mkdir -p /tmp/b46-assets /tmp/b46-runtime /tmp/b46-backup /tmp/screens

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
vid=p['result']['deployments'][0]['versions'][0]['version_id'];pathlib.Path('/tmp/pre-version.txt').write_text(vid);print('PRE_VERSION='+vid)
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/workers/ball46-production/versions/{vid}?include=modules'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
res=p.get('result') or {};mods=res.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('RUNTIME_UNEXPECTED')
runtime=base64.b64decode(mods[0]['content_base64']);pathlib.Path('/tmp/b46-runtime/index.js').write_bytes(runtime)
pathlib.Path('/tmp/runtime.sha').write_text(hashlib.sha256(runtime).hexdigest())
pathlib.Path('/tmp/runtime.meta').write_text(json.dumps({k:res.get(k) for k in ['main_module','compatibility_date','bindings','assets','usage_model']},sort_keys=True))
PY

python3 - <<'PY'
import json,os,pathlib,urllib.request
h={'Authorization':f"Bearer {os.environ['GH_TOKEN']}",'Accept':'application/vnd.github+json'}
sha='6276320261cdc10a3835b27e81850c3d4f17f126'
with urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/mccareysupon-png/nomadtips3-live-test/git/trees/{sha}?recursive=1',headers=h),timeout=30) as r:p=json.load(r)
pre='nomad-live-343/';paths=sorted(x['path'][len(pre):] for x in p['tree'] if x.get('type')=='blob' and x.get('path','').startswith(pre))
if len(paths)!=69:raise SystemExit(f'PATH_COUNT_CHANGED:{len(paths)}')
pathlib.Path('/tmp/asset-paths.txt').write_text('\n'.join(paths)+'\n')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "/tmp/b46-assets/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "/tmp/b46-assets/$rel" -w '%{http_code}' "$WWW/$rel?odds-base=$nonce-$(date +%s%N)") || true
  [ "$code" = 200 ] || { echo "ASSET_FETCH_${code}:$rel"; exit 1; }
done < /tmp/asset-paths.txt
cp -a /tmp/b46-assets /tmp/b46-before
cp -a /tmp/b46-before /tmp/b46-backup/assets
cp /tmp/b46-runtime/index.js /tmp/pre-version.txt /tmp/runtime.sha /tmp/runtime.meta /tmp/asset-paths.txt /tmp/b46-backup/
grep -Fq '<span>LIVE WORKSPACE</span><b>BULK · DEC</b>' /tmp/b46-assets/index.html
grep -Fq "const STORAGE_KEY='nomad343_odds_format_v1';" /tmp/b46-assets/odds-format-343.js
grep -Fq "const FORMATS={decimal:'DEC',fractional:'FRA',american:'AM'};" /tmp/b46-assets/odds-format-343.js
! grep -Fq 'data-workspace-odds-slot' /tmp/b46-assets/index.html
echo CURRENT_PRODUCTION_LOCKED

python3 - <<'PY'
from pathlib import Path
import hashlib,re
root=Path('/tmp/b46-assets');before=Path('/tmp/b46-before');token='343-odds-format-under-logo-20260927a'
ip=root/'index.html';s=ip.read_text()
old='<div class="workspace-brand-meta"><span>LIVE WORKSPACE</span><b>BULK · DEC</b></div>'
new='<div class="workspace-brand-meta" data-workspace-odds-slot aria-label="Odds display format"></div>'
if s.count(old)!=1:raise SystemExit(f'BRAND_META_TARGET_COUNT:{s.count(old)}')
s=s.replace(old,new,1)
if 'odds-format-343.js' in s:raise SystemExit('ODDS_FORMAT_ALREADY_LOADED_UNEXPECTEDLY')
marker=re.search(r'<script src="dashboard-v2-stage3\.js[^\"]*" defer></script>',s)
if not marker:raise SystemExit('DASHBOARD_SCRIPT_MARKER_NOT_FOUND')
s=s[:marker.end()]+f'<script src="odds-format-343.js?v={token}" defer></script>'+s[marker.end():]
ip.write_text(s)

jp=root/'odds-format-343.js';j=jp.read_text()
a="    root.querySelectorAll?.('td.odds').forEach(convertDirectElement);"
b="    root.querySelectorAll?.('td.odds').forEach(convertDirectElement);\n    root.querySelectorAll?.('.market-prices strong').forEach(convertDirectElement);\n    root.querySelectorAll?.('.feature-signal-meta span').forEach(convertOddsLabel);"
if j.count(a)!=1:raise SystemExit('APPLY_TARGET_BAD')
j=j.replace(a,b,1)
a="  const host=document.querySelector('.topbar-inner');if(!host)return;"
b="  const host=document.querySelector('[data-workspace-odds-slot]')||document.querySelector('.topbar-inner');if(!host)return;"
if j.count(a)!=1:raise SystemExit('HOST_TARGET_BAD')
j=j.replace(a,b,1)
anchor="function convertLiveInline(el){\n  if(!el.dataset.nomadOddsRaw){const p=parseAt(el.textContent);if(!p)return;el.dataset.nomadOddsRaw=p.raw;el.dataset.nomadOddsPrefix=p.prefix;el.dataset.nomadOddsSuffix=p.suffix}\n  setElementText(el,`${el.dataset.nomadOddsPrefix||''}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);\n}\n"
addon="""function convertOddsLabel(el){
  if(!el.dataset.nomadOddsRaw){const m=String(el.textContent||'').match(/^(\\s*Odds\\s+)([0-9]+(?:\\.[0-9]+)?)(.*)$/i);if(!m)return;el.dataset.nomadOddsRaw=m[2];el.dataset.nomadOddsPrefix=m[1];el.dataset.nomadOddsSuffix=m[3]}
  setElementText(el,`${el.dataset.nomadOddsPrefix||'Odds '}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);
}
"""
if j.count(anchor)!=1:raise SystemExit('LABEL_ANCHOR_BAD')
j=j.replace(anchor,anchor+addon,1)
style_anchor='  document.head.appendChild(s);'
context_style="""  s.textContent+=`.workspace-brand-meta .odds-format-control{position:relative!important;flex:1 1 auto!important;width:100%!important;min-width:0!important}.workspace-brand-meta .odds-format-button{height:27px!important;width:100%!important;padding:0!important;text-align:left!important;color:var(--muted)!important;font-size:7px!important;letter-spacing:.07em!important}.workspace-brand-meta .odds-format-button:hover,.workspace-brand-meta .odds-format-button:focus-visible{color:var(--text)!important}.workspace-brand-meta .odds-format-menu{position:fixed!important;right:auto!important;min-width:148px!important;padding:4px!important;background:var(--panel)!important;border:1px solid var(--line)!important;box-shadow:0 10px 28px rgba(0,0,0,.18)!important}.workspace-brand-meta .odds-format-menu button{color:var(--muted)!important;background:transparent!important;font-size:8px!important}.workspace-brand-meta .odds-format-menu button:hover,.workspace-brand-meta .odds-format-menu button.active{background:var(--panel-2)!important;color:var(--text)!important}`;
"""
if j.count(style_anchor)!=1:raise SystemExit('STYLE_ANCHOR_BAD')
j=j.replace(style_anchor,context_style+style_anchor,1)
click="  button.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open))});"
click_new="""  const placeMenu=()=>{if(!host.matches('[data-workspace-odds-slot]'))return;const r=button.getBoundingClientRect();menu.style.left=`${Math.round(r.left)}px`;menu.style.top=`${Math.round(r.bottom+3)}px`;menu.style.right='auto'};
  button.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)placeMenu()});"""
if j.count(click)!=1:raise SystemExit('CLICK_ANCHOR_BAD')
j=j.replace(click,click_new,1)
jp.write_text(j)
changed=[]
for rel in Path('/tmp/asset-paths.txt').read_text().splitlines():
    if hashlib.sha256((before/rel).read_bytes()).digest()!=hashlib.sha256((root/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html','odds-format-343.js']:raise SystemExit('DIFF_GATE_FAILED:'+repr(changed))
PY
node --check /tmp/b46-assets/odds-format-343.js
grep -Fq 'data-workspace-odds-slot' /tmp/b46-assets/index.html
grep -Fq "odds-format-343.js?v=$ODDS_TOKEN" /tmp/b46-assets/index.html
! grep -Fq '<span>LIVE WORKSPACE</span><b>BULK · DEC</b>' /tmp/b46-assets/index.html
echo ODDS_SLOT_PATCH_PASS

cat > /tmp/b46-runtime/wrangler.jsonc <<'EOF'
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"/tmp/b46-assets","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd /tmp/b46-runtime
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc

python3 - <<'PY'
import json,os,pathlib,urllib.request
h={'Authorization':f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}",'Accept':'application/json'};a=os.environ['CLOUDFLARE_ACCOUNT_ID']
with urllib.request.urlopen(urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments',headers=h),timeout=30) as r:p=json.load(r)
cur=p['result']['deployments'][0]['versions'][0]['version_id'];pre=pathlib.Path('/tmp/pre-version.txt').read_text().strip();print('RACE',cur,pre)
if cur!=pre:raise SystemExit('PRODUCTION_MOVED')
PY
for f in index.html odds-format-343.js dashboard-v2-stage3.js v2-shared.css; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$f?race=${GITHUB_RUN_ID}-$(date +%s%N)" -o "/tmp/race-$f"
  [ "$(sha256sum "/tmp/race-$f" | awk '{print $1}')" = "$(sha256sum "/tmp/b46-before/$f" | awk '{print $1}')" ] || { echo "RACE_ASSET_MOVED:$f"; exit 1; }
done
echo RACE_GUARD_PASS

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc | tee /tmp/deploy.log
grep -Eq 'Uploaded ball46-production|Current Version ID:' /tmp/deploy.log

sleep 5
ok=0
for pass in 1 2 3 4; do
  rm -rf /tmp/b46-after && mkdir -p /tmp/b46-after
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    mkdir -p "/tmp/b46-after/$(dirname "$rel")"
    curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?verify=${GITHUB_RUN_ID}-${pass}-$(date +%s%N)" -o "/tmp/b46-after/$rel"
  done < /tmp/asset-paths.txt
  if python3 - <<'PY'
from pathlib import Path
import hashlib
w=Path('/tmp/b46-assets');g=Path('/tmp/b46-after');bad=[]
for rel in Path('/tmp/asset-paths.txt').read_text().splitlines():
    if hashlib.sha256((w/rel).read_bytes()).digest()!=hashlib.sha256((g/rel).read_bytes()).digest():bad.append(rel)
print('WWW_ASSET_MISMATCH=',bad);raise SystemExit(0 if not bad else 1)
PY
  then ok=1;break;fi
  sleep 2
done
[ "$ok" = 1 ] || exit 1

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1200 --virtual-time-budget=12000 --dump-dom "$WWW/index.html?status=live&odds-dom=${GITHUB_RUN_ID}" >/tmp/odds-dom.html 2>/tmp/chrome-dom.log
grep -Fq 'data-odds-format-button' /tmp/odds-dom.html
grep -Fq 'ODDS · DEC ▾' /tmp/odds-dom.html
python3 - <<'PY'
import re
d=open('/tmp/odds-dom.html').read();m=re.search(r'<div class="workspace-brand-meta"[^>]*data-workspace-odds-slot[^>]*>(.*?)</div>',d,re.S)
if not m:raise SystemExit('ODDS_SLOT_NOT_RENDERED')
x=m.group(1)
if 'LIVE WORKSPACE' in x or 'BULK · DEC' in x:raise SystemExit('OLD_META_STILL_IN_SLOT')
if 'ODDS · DEC' not in x:raise SystemExit('ODDS_CONTROL_NOT_IN_SLOT')
print('ODDS_SLOT_DOM_OK')
PY
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1200 --virtual-time-budget=12000 --screenshot=/tmp/screens/odds-slot.png "$WWW/index.html?status=live&odds-screen=${GITHUB_RUN_ID}" >/tmp/chrome-shot.log 2>&1
test -s /tmp/screens/odds-slot.png

# Real browser API switch test via Chrome DevTools Protocol.
rm -rf /tmp/chrome-odds
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-odds "$WWW/index.html?status=live&odds-cdp=${GITHUB_RUN_ID}" >/tmp/chrome-cdp.log 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9222/json >/tmp/pages.json 2>/dev/null && break; sleep 1; done
sleep 10
cat > /tmp/cdp-test.js <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/pages.json','utf8'));const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!page)throw Error('NO_PAGE');
const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const wait=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;wait.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(wait.has(n)){wait.delete(n);reject(Error('CDP_TIMEOUT:'+method))}},10000)});
(async()=>{await new Promise(r=>ws.onopen=r);await send('Runtime.enable');async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r.result?.result?.value}
const ready=await ev(`({api:!!window.NOMAD343_ODDS,button:document.querySelector('[data-odds-format-button]')?.textContent||'',count:document.querySelectorAll('.market-prices strong').length})`);console.log('READY',ready);if(!ready.api)throw Error('ODDS_API_MISSING');
const am=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('american');const e=[...document.querySelectorAll('.market-prices strong')].find(x=>x.dataset.nomadOddsRaw);return{format:window.NOMAD343_ODDS.format,button:document.querySelector('[data-odds-format-button]')?.textContent||'',raw:e?.dataset.nomadOddsRaw||'',shown:e?.textContent||''}})()`);console.log('AM',am);if(am.format!=='american'||!am.button.includes('AM'))throw Error('AM_SWITCH_FAILED');
const fra=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('fractional');const e=[...document.querySelectorAll('.market-prices strong')].find(x=>x.dataset.nomadOddsRaw);return{format:window.NOMAD343_ODDS.format,button:document.querySelector('[data-odds-format-button]')?.textContent||'',raw:e?.dataset.nomadOddsRaw||'',shown:e?.textContent||''}})()`);console.log('FRA',fra);if(fra.format!=='fractional'||!fra.button.includes('FRA'))throw Error('FRA_SWITCH_FAILED');
const dec=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('decimal');return{format:window.NOMAD343_ODDS.format,button:document.querySelector('[data-odds-format-button]')?.textContent||''}})()`);console.log('DEC',dec);if(dec.format!=='decimal'||!dec.button.includes('DEC'))throw Error('DEC_SWITCH_FAILED');console.log('ODDS_FORMAT_BEHAVIOR_OK');ws.close();})().catch(e=>{console.error(e);process.exitCode=1;try{ws.close()}catch{}});
NODE
node /tmp/cdp-test.js
kill $CPID 2>/dev/null || true
trap - EXIT

echo BALL46_ODDS_SLOT_VERIFIED
