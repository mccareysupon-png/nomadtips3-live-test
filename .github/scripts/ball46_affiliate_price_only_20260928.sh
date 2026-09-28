#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
ROOT="/tmp/b46-affiliate-price-only"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
CLEAN="/tmp/b46-affiliate-price-only-clean"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"
rm -rf "$ROOT" "$CLEAN"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$CLEAN"

# Lock the exact CURRENT Production runtime/config. Never deploy an old runtime or old asset bundle.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-affiliate-price-only')
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];r.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('INDEX_MODULE_MISSING')
runtime=base64.b64decode(main[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
r.joinpath('runtime/index.js').write_bytes(runtime);r.joinpath('runtime.sha').write_text(sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('CRON_CHANGED')
print('CURRENT_LOCK_OK',vid,'modules=',[m.get('name') for m in mods],'main_sha=',sha)
PY

python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt');xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79:raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','full-market-bookmaker-343.js','full-market-bookmaker-343.css','odds-format-343.js','dashboard-v2-stage3.js','signal.js','statistics.js'}
if not need.issubset(xs):raise SystemExit('REQUIRED_MISSING:'+repr(sorted(need-set(xs))))
Path('/tmp/b46-affiliate-price-only/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-aff-price=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

# Health snapshot before UI-only patch.
nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46aff=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46aff=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46aff=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Current Production must still contain the renderer-owned 1xBet logo patch we are replacing.
grep -Fq "const ONE_XBET_AFFILIATE_URL='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "const ONE_XBET_LOGO_URL='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png';" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'function oneXBetPriceHtml(v,slug)' "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'function bookLabelHtml(b)' "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'B46_1XBET_UI_STABLE_20260928' "$BEFORE/full-market-bookmaker-343.css"
grep -Fq "['1xbet','1xBet']" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill']" "$BEFORE/full-market-bookmaker-343.js"
# No old post-DOM affiliate layer may coexist.
! grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$BEFORE/odds-format-343.js" || { echo OLD_POST_DOM_AFFILIATE_LAYER_PRESENT; exit 1; }

# Patch only the true Full Market renderer. Bookmaker labels remain plain text; only price cells get links.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-affiliate-price-only/after/full-market-bookmaker-343.js');s=p.read_text()
old="""const ONE_XBET_AFFILIATE_URL='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';
const ONE_XBET_LOGO_URL='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png';
const ONE_XBET_PRICE_RE=/^(?:\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|[+-]\\d+)$/;
"""
new="""const AFFILIATE_URLS=Object.freeze({
  '1xbet':'https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97',
  'williamhill':'https://campaigns.williamhill.com/C.ashx?btag=a_189870b_33c_&affid=1739384&siteid=189870&adid=33&c='
});
const AFFILIATE_PRICE_RE=/^(?:\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|[+-]\\d+)$/;
"""
if s.count(old)!=1:raise SystemExit('AFFILIATE_CONSTANT_BLOCK_COUNT_'+str(s.count(old)))
s=s.replace(old,new,1)
oldfn="""function oneXBetPriceHtml(v,slug){const text=String(v??'—').trim()||'—';if(slug!=='1xbet'||text==='—'||!ONE_XBET_PRICE_RE.test(text))return esc(text);return `<a class=\"fmb-1xbet-odds\" data-b46-1xbet-odds=\"1\" href=\"${ONE_XBET_AFFILIATE_URL}\" target=\"_blank\" rel=\"sponsored noopener noreferrer\" title=\"1xBet affiliate link · 18+ · Gamble responsibly\">${esc(text)}</a>`}
"""
newfn="""function affiliatePriceHtml(v,slug){const text=String(v??'—').trim()||'—',url=AFFILIATE_URLS[slug];if(!url||text==='—'||!AFFILIATE_PRICE_RE.test(text))return esc(text);const label=slug==='1xbet'?'1xBet':slug==='williamhill'?'William Hill':'Bookmaker';return `<a class=\"fmb-affiliate-odds\" data-b46-affiliate-odds=\"${esc(slug)}\" href=\"${esc(url)}\" target=\"_blank\" rel=\"sponsored noopener noreferrer\" title=\"${esc(label)} affiliate link · 18+ · Gamble responsibly\">${esc(text)}</a>`}
"""
if s.count(oldfn)!=1:raise SystemExit('OLD_PRICE_FUNCTION_COUNT_'+str(s.count(oldfn)))
s=s.replace(oldfn,newfn,1)
if s.count('oneXBetPriceHtml')!=5:raise SystemExit('PRICE_CALL_COUNT_'+str(s.count('oneXBetPriceHtml')))
s=s.replace('oneXBetPriceHtml','affiliatePriceHtml')
oldlabel="""function bookLabelHtml(b){if(b.slug!=='1xbet')return esc(b.name);return `<span class=\"fmb-book-logo fmb-book-logo-1xbet\" aria-label=\"1xBet\"><img src=\"${ONE_XBET_LOGO_URL}\" alt=\"1xBet\" width=\"42\" height=\"10\" decoding=\"async\" referrerpolicy=\"no-referrer\"></span>`}
"""
if s.count(oldlabel)!=1:raise SystemExit('BOOK_LABEL_FUNCTION_COUNT_'+str(s.count(oldlabel)))
s=s.replace(oldlabel,'',1)
needle='<b>${bookLabelHtml(b)}</b>'
if s.count(needle)!=1:raise SystemExit('BOOK_LABEL_USE_COUNT_'+str(s.count(needle)))
s=s.replace(needle,'<b>${esc(b.name)}</b>',1)
p.write_text(s)
PY

# Remove all logo-specific CSS and keep only geometry-neutral price link styling.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-affiliate-price-only/after/full-market-bookmaker-343.css');s=p.read_text();marker='/* B46_1XBET_UI_STABLE_20260928'
if s.count(marker)!=1:raise SystemExit('OLD_CSS_MARKER_COUNT_'+str(s.count(marker)))
base=s[:s.index(marker)].rstrip()
css=r'''/* B46_AFFILIATE_PRICE_ONLY_20260928: bookmaker labels untouched; only real price values are links. */
.fmb-affiliate-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;background:transparent!important}
.fmb-affiliate-odds:hover,.fmb-affiliate-odds:focus-visible,.fmb-affiliate-odds:active{filter:brightness(1.35);text-shadow:0 0 6px currentColor;outline:none}'''
p.write_text(base+'\n\n'+css+'\n')
PY

# Syntax and semantic guards.
node --check "$AFTER/full-market-bookmaker-343.js"
node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_AFFILIATE_PRICE_ONLY_20260928' "$AFTER/full-market-bookmaker-343.css"
grep -Fq "'1xbet':'https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97'" "$AFTER/full-market-bookmaker-343.js"
grep -Fq "'williamhill':'https://campaigns.williamhill.com/C.ashx?btag=a_189870b_33c_&affid=1739384&siteid=189870&adid=33&c='" "$AFTER/full-market-bookmaker-343.js"
grep -Fq 'function affiliatePriceHtml(v,slug)' "$AFTER/full-market-bookmaker-343.js"
grep -Fq '<b>${esc(b.name)}</b>' "$AFTER/full-market-bookmaker-343.js"
grep -Fq '<td>${esc(c?.line||'"'"'—'"'"')}</td><td>${affiliatePriceHtml' "$AFTER/full-market-bookmaker-343.js"
! grep -Eq 'ONE_XBET_LOGO_URL|bookLabelHtml|fmb-book-logo|fmb-1xbet-odds|data-b46-1xbet-odds' "$AFTER/full-market-bookmaker-343.js" || { echo LOGO_OR_OLD_LINK_CODE_REMAINS; exit 1; }
! grep -Eq 'fmb-book-logo|fmb-1xbet-odds' "$AFTER/full-market-bookmaker-343.css" || { echo LOGO_OR_OLD_CSS_REMAINS; exit 1; }
# Bookmaker menu names remain original text values.
grep -Fq "['1xbet','1xBet']" "$AFTER/full-market-bookmaker-343.js"
grep -Fq "['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill']" "$AFTER/full-market-bookmaker-343.js"
# Odds formatter must be byte-identical; affiliate work is not allowed there.
cmp -s "$BEFORE/odds-format-343.js" "$AFTER/odds-format-343.js" || { echo ODDS_FORMAT_CHANGED; exit 1; }
echo STATIC_PRICE_ONLY_INVARIANTS_OK

# Hard diff gate: exactly two presentation assets may differ from CURRENT Production.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-affiliate-price-only');changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['full-market-bookmaker-343.css','full-market-bookmaker-343.js']:raise SystemExit('TWO_FILE_DIFF_FAILED:'+repr(changed))
PY
echo TWO_FILE_DIFF_GATE_PASS

# Preserve the exact current runtime and bindings while deploying the current asset snapshot + two-file patch.
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

# Race guard: another page may be working. Abort instead of overwriting if Production moved.
python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-affiliate-price-only/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p:raise SystemExit('PRODUCTION_MOVED')
print('RACE_GUARD_PASS')
PY

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

# Verify runtime SHA/module shape after deploy.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-affiliate-price-only');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];print('POST_MODULES',[m.get('name') for m in mods])
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_SHAPE_BAD')
raw=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(raw).hexdigest();pre=r.joinpath('runtime.sha').read_text().strip();print('POST_RUNTIME_CLEAN',vid,sha)
if sha!=pre:raise SystemExit('RUNTIME_SHA_CHANGED')
r.joinpath('post-version.txt').write_text(vid)
PY

# Every one of the 79 assets must match the intended target snapshot.
cd "$GITHUB_WORKSPACE"
nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
mkdir -p "$ROOT/post"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$ROOT/post/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$ROOT/post/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-aff-post=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "POST_FETCH_FAILED:$code:$rel"; exit 1; }
  cmp -s "$AFTER/$rel" "$ROOT/post/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_79_ASSETS_MATCH_TARGET

# Explicit UI-source checks on Production response.
grep -Fq '<b>${esc(b.name)}</b>' "$ROOT/post/full-market-bookmaker-343.js"
grep -Fq 'data-b46-affiliate-odds' "$ROOT/post/full-market-bookmaker-343.js"
grep -Fq 'williamhill' "$ROOT/post/full-market-bookmaker-343.js"
! grep -Eq 'ONE_XBET_LOGO_URL|bookLabelHtml|fmb-book-logo' "$ROOT/post/full-market-bookmaker-343.js" || { echo POST_LOGO_CODE_REMAINS; exit 1; }
grep -Fq 'B46_AFFILIATE_PRICE_ONLY_20260928' "$ROOT/post/full-market-bookmaker-343.css"

# Post-health snapshot: data flow must remain intact.
nonce="${GITHUB_RUN_ID}-postflow-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46aff=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46aff=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46aff=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-affiliate-price-only/stats-after.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_AFFILIATE_PRICE_ONLY_VERIFIED
