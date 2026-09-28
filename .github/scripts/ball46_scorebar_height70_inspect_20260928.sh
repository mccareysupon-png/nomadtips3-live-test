#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-height70-inspect'; rm -rf "$ROOT"; mkdir -p "$ROOT"
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
print('PRODUCTION_RUNTIME_LOCK',vid,sha)
PY
curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/singlepage-workspace-343.css?heightinspect=$nonce" -o "$ROOT/live.css"
curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/?heightinspect=$nonce" -o "$ROOT/index.html"
python3 - <<'PY'
from pathlib import Path
import re,hashlib,json
css=Path('/tmp/b46-height70-inspect/live.css').read_text()
print('LIVE_CSS_SHA',hashlib.sha256(css.encode()).hexdigest())
found=[]
for i,m in enumerate(re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S),1):
    sel=' '.join(re.sub(r'/\*.*?\*/',' ',m.group(1),flags=re.S).split())
    body=' '.join(m.group(2).split())
    if 'workspace-scorebar' not in sel and 'workspace-scorebar' not in body: continue
    decl=[]
    for dm in re.finditer(r'(height|min-height|max-height|grid-auto-rows|grid-template-rows|padding-top|padding-bottom|gap)\s*:\s*([^;]+)',m.group(2),re.I):
        decl.append((dm.group(1),dm.group(2).strip()))
    if decl:
        found.append({'rule':i,'selector':sel,'decl':decl})
for x in found: print('SCOREBAR_RULE',json.dumps(x,ensure_ascii=False))
print('SCOREBAR_RULE_COUNT',len(found))
refs=re.findall(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+',Path('/tmp/b46-height70-inspect/index.html').read_text())
print('CACHE_REFS',refs)
PY
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,900 --remote-debugging-port=9897 --user-data-dir="$ROOT/chrome" "$DIRECT/?heightinspect=$nonce" >"$ROOT/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 80); do curl -fsS http://127.0.0.1:9897/json > "$ROOT/pages.json" 2>/dev/null && break; sleep .5; done
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-height70-inspect/pages.json')),p=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&q.has(m.id)){const z=q.get(m.id);q.delete(m.id);m.error?z.j(Error(JSON.stringify(m.error))):z.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await new Promise(r=>setTimeout(r,3500));const z=await call('Runtime.evaluate',{expression:`(()=>{const slot=document.querySelector('[data-workspace-scorebar-slot]'), cards=[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-grid>div')]; return {slot:slot?getComputedStyle(slot).display:null,count:cards.length,heights:cards.map(x=>x.getBoundingClientRect().height),widths:cards.map(x=>x.getBoundingClientRect().width),grid:cards[0]?.parentElement?getComputedStyle(cards[0].parentElement).gridAutoRows:null}})()`,returnByValue:true});console.log('BROWSER_DIMENSIONS',JSON.stringify(z.result.result.value));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$ROOT/check.js"
kill $CPID 2>/dev/null || true; trap - EXIT
echo BALL46_HEIGHT70_INSPECT_SUCCESS
