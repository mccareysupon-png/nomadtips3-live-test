#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
WORKER="ball46-production"
ROOT="/tmp/b46-1xbet-affiliate"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"

rm -rf "$ROOT"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY"

# Lock the exact CURRENT Production runtime/config. Preserve it byte-for-byte.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-1xbet-affiliate')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r:return json.load(r)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps:raise SystemExit('NO_CURRENT_DEPLOYMENT')
d=deps[0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('UNEXPECTED_DEPLOYMENT_SHAPE:'+json.dumps(vs))
vid=vs[0]['version_id']; root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('RUNTIME_MODULE_SHAPE_CHANGED')
runtime=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
root.joinpath('runtime/index.js').write_bytes(runtime); root.joinpath('runtime.sha').write_text(sha)
if v.get('compatibility_date')!='2026-09-09':raise SystemExit('COMPAT_DATE_CHANGED:'+repr(v.get('compatibility_date')))
if (v.get('compatibility_flags') or [])!=[]:raise SystemExit('COMPAT_FLAGS_CHANGED:'+repr(v.get('compatibility_flags')))
expect_bind=[
 {'name':'ASSETS','type':'assets','service':None,'environment':None},
 {'name':'ENGINE','type':'service','service':'nomadtips3-engine-343','environment':'production'},
 {'name':'FULL_MARKET','type':'service','service':'nomadtips3-full-market-343-ball46','environment':'production'},
 {'name':'HUB','type':'service','service':'nomadtips3-5usd-hub-343','environment':'production'},
]
def norm(bs):return sorted([{k:b.get(k) for k in ('name','type','service','environment')} for b in bs],key=lambda x:x['name'])
if norm(v.get('bindings') or [])!=sorted(expect_bind,key=lambda x:x['name']):raise SystemExit('BINDINGS_CHANGED:'+json.dumps(norm(v.get('bindings') or []),sort_keys=True))
ac=(v.get('assets') or {}).get('config') or {}; exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+json.dumps(ac,sort_keys=True))
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']; schedules=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
crons=[x.get('cron') for x in schedules if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']:raise SystemExit('CRON_CHANGED:'+repr(crons))
meta={k:v.get(k) for k in ('main_module','compatibility_date','compatibility_flags','bindings','assets','usage_model')}
root.joinpath('runtime-meta.json').write_text(json.dumps(meta,indent=2,sort_keys=True)); root.joinpath('schedules.json').write_text(json.dumps(schedules,indent=2,sort_keys=True))
print('CURRENT_PRODUCTION_LOCK_OK',vid,sha)
PY

# Mirror exactly the known CURRENT live asset set; no old branch assets are copied.
python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt')
paths=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(paths)!=79 or len(set(paths))!=79:raise SystemExit('PATH_MAP_NOT_79')
required={'index.html','odds-format-343.js','dashboard-v2-stage3.js','full-market-bookmaker-343.js','signal.js','statistics.js'}
if not required.issubset(paths):raise SystemExit('PATH_MAP_REQUIRED_MISSING:'+repr(sorted(required-set(paths))))
Path('/tmp/b46-1xbet-affiliate/live-paths.txt').write_text('\n'.join(paths)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-1xbet-baseline=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_ASSET_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "LIVE_ASSET_EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

# Confirm we are patching the current known render topology, without editing it.
grep -Fq "['1xbet','1xBet']" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "slug:'1xbet',name:'1xBet'" "$BEFORE/dashboard-v2-stage3.js"
grep -Fq "const STORAGE_KEY='nomad343_odds_format_v1';" "$BEFORE/odds-format-343.js"
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$BEFORE/odds-format-343.js"
! grep -Fq 'B46_1XBET_AFFILIATE_20260928' "$BEFORE/odds-format-343.js" || { echo AFFILIATE_PATCH_ALREADY_PRESENT; exit 1; }

# Health snapshot before change.
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46-1xbet-pre=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46-1xbet-pre=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46-1xbet-pre=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# ONE-FILE presentation-only patch. No API, fetch, odds source, signal or statistics logic is changed.
cat >> "$AFTER/odds-format-343.js" <<'JS'

/* B46_1XBET_AFFILIATE_20260928
   Presentation-only affiliate layer. It never fetches odds, changes prices,
   changes bookmaker selection, creates signals, or writes statistics. */
(()=>{
'use strict';
const VERSION='343-1xbet-affiliate-v1';
const FALLBACK_URL='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';
const LOGO_URL='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png';
const BOOK_RE=/^1x\s*bet$/i;
const PRICE_RE=/^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|[+-]\d+)$/;
let scheduled=false;

function exactBook(el){return !!el&&!el.dataset.b46OneXBetBrand&&BOOK_RE.test(String(el.textContent||'').trim())}
function validPriceText(v){const s=String(v||'').trim();return s!=='—'&&PRICE_RE.test(s)}
function affiliateHref(){
  // Exact-match links can be injected later after they are generated/verified in 1xBet Partners.
  // Until then, never invent a target-page parameter: preserve the verified affiliate fallback URL.
  return FALLBACK_URL;
}
function linkPrice(el){
  if(!el||el.querySelector?.('a[data-b46-1xbet-odds]'))return;
  const text=String(el.textContent||'').trim();if(!validPriceText(text))return;
  const a=document.createElement('a');
  a.dataset.b46OneXBetOdds='1';a.href=affiliateHref();a.target='_blank';a.rel='sponsored noopener noreferrer';
  a.className='b46-1xbet-odds';a.textContent=text;
  a.setAttribute('aria-label',`1xBet affiliate odds ${text}`);
  a.title='1xBet affiliate link · 18+ · Gamble responsibly';
  el.textContent='';el.appendChild(a);
}
function brandify(el){
  if(!exactBook(el))return;
  el.dataset.b46OneXBetBrand='1';el.textContent='';
  const mark=document.createElement('span');mark.className='b46-1xbet-brand';mark.setAttribute('aria-label','1xBet');
  const img=document.createElement('img');img.src=LOGO_URL;img.alt='1xBet';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  mark.appendChild(img);el.appendChild(mark);
}
function decorateFullMarket(){
  document.querySelectorAll('[data-fmb-book="1xbet"]').forEach(tab=>{
    const label=tab.querySelector('b');if(label)brandify(label);
    if(!tab.classList.contains('active'))return;
    const card=tab.closest('[data-full-market-card]')||tab.closest('.match-expanded')||document;
    const panel=card.querySelector('[data-fmb-panel]');if(!panel)return;
    panel.querySelectorAll('table').forEach(table=>{
      const headers=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toUpperCase()).slice(1);
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.querySelectorAll('td')].forEach((td,i)=>{
          const h=headers[i]||'';
          if(h==='LINE'||h==='RAW'||/LINE|HANDICAP/.test(h))return;
          linkPrice(td);
        });
      });
    });
  });
}
function decorateAdjacentOdds(){
  // Statistics/history tables: odds cell immediately precedes bookmaker cell.
  document.querySelectorAll('td').forEach(td=>{if(!exactBook(td))return;const prev=td.previousElementSibling;if(prev&&validPriceText(prev.textContent))linkPrice(prev)});
  // Signal detail grid: locate the explicitly labelled ODDS field when bookmaker is 1xBet.
  document.querySelectorAll('strong,b,span').forEach(el=>{
    if(!exactBook(el))return;
    const box=el.parentElement,grid=box?.parentElement;
    if(!grid)return;
    const oddsBox=[...grid.children].find(x=>/ODDS/.test(String(x.querySelector?.('span,small')?.textContent||'').toUpperCase()));
    const value=oddsBox?.querySelector?.('strong,b');if(value)linkPrice(value);
  });
}
function decorateBrandText(){
  document.querySelectorAll('b,strong,span,small,td').forEach(el=>{if(exactBook(el))brandify(el)});
}
function run(){
  decorateFullMarket();
  decorateAdjacentOdds();
  decorateBrandText();
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;run()})}
function installStyle(){
  if(document.querySelector('style[data-b46-1xbet-affiliate]'))return;
  const s=document.createElement('style');s.dataset.b46OneXBetAffiliate='1';
  s.textContent='.b46-1xbet-brand{display:inline-flex;align-items:flex-start;width:58px;height:14px;overflow:hidden;vertical-align:middle;line-height:1}.b46-1xbet-brand img{display:block;width:58px;height:auto;max-width:none}.b46-1xbet-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border-bottom:1px dotted currentColor}.b46-1xbet-odds:hover,.b46-1xbet-odds:focus-visible{filter:brightness(.82);outline:none}@media(max-width:760px){.b46-1xbet-brand{width:50px;height:12px}.b46-1xbet-brand img{width:50px}}';
  document.head.appendChild(s);
}
function start(){installStyle();run();new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});document.addEventListener('click',e=>{if(e.target.closest?.('[data-fmb-book]'))schedule()},true);window.BALL46_1XBET_AFFILIATE={version:VERSION,url:FALLBACK_URL,run}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
JS

node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_1XBET_AFFILIATE_20260928' "$AFTER/odds-format-343.js"
grep -Fq 'https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97' "$AFTER/odds-format-343.js"
grep -Fq "rel='sponsored noopener noreferrer'" "$AFTER/odds-format-343.js"
! sed -n '/B46_1XBET_AFFILIATE_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Eq '\bfetch\s*\(|XMLHttpRequest|/api/' || { echo AFFILIATE_LAYER_NETWORK_OR_API_TOUCH; exit 1; }

# Hard diff gate: exactly one existing Production asset may differ.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-1xbet-affiliate'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    a=(r/'before'/rel).read_bytes(); b=(r/'after'/rel).read_bytes()
    if hashlib.sha256(a).digest()!=hashlib.sha256(b).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['odds-format-343.js']:raise SystemExit('ONE_FILE_DIFF_GATE_FAILED:'+repr(changed))
r.joinpath('changed-assets.txt').write_text('\n'.join(changed)+'\n')
PY
echo ONE_FILE_DIFF_GATE_PASS

# Build Wrangler config only from the locked CURRENT Production metadata.
python3 - <<'PY'
from pathlib import Path
import json
r=Path('/tmp/b46-1xbet-affiliate'); meta=json.loads(r.joinpath('runtime-meta.json').read_text()); sched=json.loads(r.joinpath('schedules.json').read_text())
services=[]
for b in meta.get('bindings') or []:
    if b.get('type')=='service':
        x={'binding':b['name'],'service':b['service']}
        if b.get('environment'):x['environment']=b['environment']
        services.append(x)
    elif b.get('type')=='assets':pass
    else:raise SystemExit('UNSUPPORTED_BINDING:'+repr(b))
crons=[x.get('cron') for x in sched if isinstance(x,dict) and x.get('cron')]
ac=(meta.get('assets') or {}).get('config') or {}
cfg={'name':'ball46-production','main':'./index.js','compatibility_date':meta['compatibility_date'],'no_bundle':True,'services':services,
     'assets':{'directory':'/tmp/b46-1xbet-affiliate/after','binding':'ASSETS','html_handling':ac.get('html_handling','none'),'not_found_handling':ac.get('not_found_handling','none'),'run_worker_first':bool(ac.get('run_worker_first',True))},
     'triggers':{'crons':crons}}
r.joinpath('wrangler.jsonc').write_text(json.dumps(cfg,indent=2,sort_keys=True))
print('WRANGLER_CONFIG='+json.dumps(cfg,sort_keys=True))
PY
cp "$RUNTIME/index.js" "$ROOT/index.js"
npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.jsonc" --dry-run

# Race guard immediately before deploy: same runtime version + unchanged relevant live assets.
python3 - <<'PY'
import json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-1xbet-affiliate'); pre=root.joinpath('pre-version.txt').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
cur=j['result']['deployments'][0]['versions'][0]['version_id']; print('RACE_VERSION',pre,cur)
if cur!=pre:raise SystemExit('RACE_VERSION_CHANGED')
PY
nonce="${GITHUB_RUN_ID:-manual}-race-$(date +%s%N)"
for rel in index.html odds-format-343.js dashboard-v2-stage3.js full-market-bookmaker-343.js signal.js statistics.js; do
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$ROOT/race-$rel"
  cmp -s "$BEFORE/$rel" "$ROOT/race-$rel" || { echo "RACE_ASSET_CHANGED:$rel"; exit 1; }
done
echo RACE_GUARD_PASS

npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.jsonc"

# Post-deploy: runtime is byte-identical and data flow remains healthy.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-1xbet-affiliate'); pre_sha=root.joinpath('runtime.sha').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vid=d['versions'][0]['version_id']; print('POST_VERSION='+vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest(); print('POST_RUNTIME_SHA='+sha)
if sha!=pre_sha:raise SystemExit('POST_RUNTIME_CHANGED')
PY

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
curl -fsS -L --retry 4 --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/odds-format-343.js?b46-1xbet-post=$nonce" -o "$VERIFY/odds-format-343.js"
grep -Fq 'B46_1XBET_AFFILIATE_20260928' "$VERIFY/odds-format-343.js"
grep -Fq 'https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97' "$VERIFY/odds-format-343.js"
for rel in index.html dashboard-v2-stage3.js full-market-bookmaker-343.js signal.js statistics.js; do
  curl -fsS -L --retry 4 --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?b46-1xbet-post=$nonce-${RANDOM}" -o "$VERIFY/$rel"
  cmp -s "$BEFORE/$rel" "$VERIFY/$rel" || { echo "POST_UNEXPECTED_ASSET_CHANGE:$rel"; exit 1; }
done
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46-1xbet-post=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46-1xbet-post=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46-1xbet-post=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-affiliate/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE
cp "$ROOT/changed-assets.txt" "$VERIFY/changed-assets.txt"
echo 'BALL46_1XBET_AFFILIATE_DEPLOY_OK' | tee "$VERIFY/status.txt"
