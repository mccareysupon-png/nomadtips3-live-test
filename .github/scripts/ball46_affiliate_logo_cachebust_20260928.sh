#!/usr/bin/env bash
set -euo pipefail
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
ROOT="/tmp/b46-affiliate-logo-cachebust"
BEFORE="$ROOT/before"; AFTER="$ROOT/after"; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"; CLEAN="$ROOT/clean"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"
rm -rf "$ROOT"; mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$CLEAN"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-affiliate-logo-cachebust');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];r.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING')
raw=base64.b64decode(main[0]['content_base64']);sha=hashlib.sha256(raw).hexdigest();r.joinpath('runtime/index.js').write_bytes(raw);r.joinpath('runtime.sha').write_text(sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
print('CURRENT_LOCK_OK',vid,'main_sha=',sha)
PY

python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt');xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79: raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','full-market-bookmaker-343.js','full-market-bookmaker-343.css','odds-format-343.js','dashboard-v2-stage3.js','signal.js','statistics.js'}
if not need.issubset(xs): raise SystemExit('REQUIRED_MISSING')
Path('/tmp/b46-affiliate-logo-cachebust/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('PATH_MAP_OK',len(xs))
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue; mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-aff-logo=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

# Pre-health
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46afflogo=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46afflogo=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46afflogo=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');for(const [f,k] of [['board-before.json','fixtures'],['signals-before.json','signals'],['stats-before.json','rows']]){const j=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-logo-cachebust/'+f));if(!Array.isArray(j[k]))throw Error('PRE_FLOW_BAD:'+f)}console.log('PRE_FLOW_OK')
NODE

# Current-production preconditions: price links already exist; do not rebuild odds logic.
grep -Fq "const AFFILIATE_URLS=Object.freeze({" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "'1xbet':'https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97'" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "'williamhill':'https://campaigns.williamhill.com/C.ashx?btag=a_189870b_33c_&affid=1739384&siteid=189870&adid=33&c='" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'function affiliatePriceHtml(v,slug)' "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'data-b46-affiliate-odds' "$BEFORE/full-market-bookmaker-343.js"
grep -Fq '<b>${esc(b.name)}</b><i></i></button>' "$BEFORE/full-market-bookmaker-343.js"
! grep -Fq 'BOOK_LOGO_URLS' "$BEFORE/full-market-bookmaker-343.js" || { echo LOGO_LAYER_ALREADY_PRESENT; exit 1; }

python3 - <<'PY'
from pathlib import Path
import re
root=Path('/tmp/b46-affiliate-logo-cachebust/after'); jp=root/'full-market-bookmaker-343.js'; cp=root/'full-market-bookmaker-343.css'; ip=root/'index.html'
s=jp.read_text(); c=cp.read_text(); h=ip.read_text()
one='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png'; wh='https://upload.wikimedia.org/wikipedia/commons/8/87/William_Hill_logo.png'
pat=re.compile(r"(const AFFILIATE_URLS=Object\.freeze\(\{\n\s*'1xbet':'[^']+',\n\s*'williamhill':'[^']+'\n\}\);\n)")
m=pat.search(s)
if not m: raise SystemExit('AFFILIATE_MAP_BLOCK_NOT_FOUND')
logo_map="const BOOK_LOGO_URLS=Object.freeze({\n  '1xbet':'%s',\n  'williamhill':'%s'\n});\n"%(one,wh)
s=s[:m.end()]+logo_map+s[m.end():]
anchor='\nfunction marketTable'
pos=s.find(anchor)
if pos<0: raise SystemExit('MARKET_TABLE_BOUNDARY_NOT_FOUND')
fn='\nfunction bookLabelHtml(b){const src=BOOK_LOGO_URLS[b?.slug];if(!src)return esc(b?.name||b?.slug||\'Bookmaker\');return `<span class="fmb-book-logo" data-b46-book-logo="${esc(b.slug)}" aria-label="${esc(b.name)}"><img src="${esc(src)}" alt="${esc(b.name)}" loading="eager" decoding="async" referrerpolicy="no-referrer"></span>`}\n'
s=s[:pos]+fn+s[pos:]
old='<b>${esc(b.name)}</b><i></i></button>'; new='<b>${bookLabelHtml(b)}</b><i></i></button>'
if s.count(old)!=1: raise SystemExit('BOOK_LABEL_USE_COUNT_'+str(s.count(old)))
s=s.replace(old,new,1)
# Explicitly keep affiliate links as first-class hit targets; no preventDefault.
oldhandler="document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-fmb-book]');if(btn){e.preventDefault();e.stopPropagation();chooseBook(btn)}},true);"
newhandler="document.addEventListener('click',e=>{const affiliate=e.target.closest?.('a[data-b46-affiliate-odds]');if(affiliate){e.stopPropagation();return}const btn=e.target.closest?.('[data-fmb-book]');if(btn){e.preventDefault();e.stopPropagation();chooseBook(btn)}},true);"
if s.count(oldhandler)==1: s=s.replace(oldhandler,newhandler,1)
elif newhandler not in s: raise SystemExit('CLICK_HANDLER_UNEXPECTED')
css='''\n/* B46_AFFILIATE_LOGO_CACHEBUST_20260928 */\n.fmb-book-logo{display:flex;align-items:center;justify-content:flex-start;width:auto;max-width:50px;height:12px;max-height:12px;overflow:hidden;pointer-events:none}\n.fmb-book-logo img{display:block;width:auto;height:auto;max-width:50px;max-height:12px;object-fit:contain;object-position:left center;pointer-events:none}\n.fmb-affiliate-odds{display:inline-block;position:relative;z-index:3;min-width:24px;pointer-events:auto!important;touch-action:manipulation;cursor:pointer!important}\n'''
if 'B46_AFFILIATE_LOGO_CACHEBUST_20260928' not in c: c=c.rstrip()+css
# Cache-bust exact Full Market JS/CSS references only.
h2=re.sub(r'full-market-bookmaker-343\.css\?v=[^"\']+', 'full-market-bookmaker-343.css?v=343-affiliate-logo-click-20260928a', h, count=1)
h2=re.sub(r'full-market-bookmaker-343\.js\?v=[^"\']+', 'full-market-bookmaker-343.js?v=343-affiliate-logo-click-20260928a', h2, count=1)
if h2==h: raise SystemExit('INDEX_CACHE_BUST_NOT_APPLIED')
for u in [one,wh]:
  if u not in s: raise SystemExit('LOGO_URL_MISSING')
if s.count('function bookLabelHtml(b)')!=1: raise SystemExit('BOOK_FN_COUNT')
if '<a' in fn.lower(): raise SystemExit('LOGO_MUST_NOT_LINK')
if '<td>${esc(c?.line||\'—\')}</td><td>${affiliatePriceHtml' not in s: raise SystemExit('LINE_PRICE_SEPARATION_MISSING')
jp.write_text(s); cp.write_text(c+'\n'); ip.write_text(h2)
print('PATCH_OK')
PY

# External logo availability before deploy.
curl -fsSL --max-time 30 'https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png' -o "$ROOT/1xbet.png"
curl -fsSL --max-time 30 'https://upload.wikimedia.org/wikipedia/commons/8/87/William_Hill_logo.png' -o "$ROOT/williamhill.png"
[ -s "$ROOT/1xbet.png" ] && [ -s "$ROOT/williamhill.png" ]
node --check "$AFTER/full-market-bookmaker-343.js"
cmp -s "$BEFORE/odds-format-343.js" "$AFTER/odds-format-343.js" || { echo ODDS_FORMAT_CHANGED; exit 1; }

python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-affiliate-logo-cachebust'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
exp=['full-market-bookmaker-343.css','full-market-bookmaker-343.js','index.html']
if sorted(changed)!=sorted(exp): raise SystemExit('THREE_FILE_DIFF_FAILED:'+repr(changed))
PY
echo THREE_FILE_DIFF_GATE_PASS

cp "$RUNTIME/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<EOF
{
  "name":"ball46-production",
  "main":"./index.js",
  "compatibility_date":"2026-09-09",
  "no_bundle":true,
  "services":[
    {"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},
    {"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},
    {"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}
  ],
  "assets":{"directory":"$AFTER","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
cd "$CLEAN"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry.log" || { echo DRY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-affiliate-logo-cachebust/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p: raise SystemExit('PRODUCTION_MOVED')
print('RACE_GUARD_PASS')
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-affiliate-logo-cachebust');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();pre=r.joinpath('runtime.sha').read_text().strip();print('POST_VERSION',vid,'sha',sha)
if sha!=pre: raise SystemExit('RUNTIME_SHA_CHANGED')
r.joinpath('post-version.txt').write_text(vid)
PY

cd "$GITHUB_WORKSPACE"
# Allow edge propagation, then verify the three changed assets from both direct and www.
sleep 8
for base in "$DIRECT" "$WWW"; do
  for rel in index.html full-market-bookmaker-343.js full-market-bookmaker-343.css; do
    out="$VERIFY/$(echo "$base"|sed 's#https://##;s#[^A-Za-z0-9]#_#g')-$(basename "$rel")"
    curl -fsSL --retry 5 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$base/$rel?post=${GITHUB_RUN_ID}-${RANDOM}" -o "$out"
  done
done

grep -Fq '343-affiliate-logo-click-20260928a' "$VERIFY/www_ball46_com-index.html"
grep -Fq 'data-b46-book-logo' "$VERIFY/www_ball46_com-full-market-bookmaker-343.js"
grep -Fq 'B46_AFFILIATE_LOGO_CACHEBUST_20260928' "$VERIFY/www_ball46_com-full-market-bookmaker-343.css"
grep -Fq 'data-b46-affiliate-odds' "$VERIFY/www_ball46_com-full-market-bookmaker-343.js"

# Post-health
nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46afflogo=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46afflogo=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46afflogo=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');for(const [f,k] of [['board-after.json','fixtures'],['signals-after.json','signals'],['stats-after.json','rows']]){const j=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-logo-cachebust/'+f));if(!Array.isArray(j[k]))throw Error('POST_FLOW_BAD:'+f)}console.log('POST_FLOW_OK')
NODE

echo BALL46_AFFILIATE_LOGO_CACHEBUST_DEPLOY_VERIFIED
