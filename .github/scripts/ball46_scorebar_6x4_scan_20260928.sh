#!/usr/bin/env bash
set -euo pipefail
ART="/tmp/b46-scorebar-base"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
VERIFY="/tmp/b46-scorebar-scan"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
rm -rf "$VERIFY" && mkdir -p "$VERIFY/live"

[ -f "$ART/after/dashboard-v2-stage3.js" ] || { echo BASE_DASHBOARD_MISSING; exit 1; }
[ "$(find "$ART/after" -type f | wc -l | tr -d ' ')" = 79 ] || { echo BASE_ASSET_COUNT_BAD; exit 1; }
grep -Fq 'BALL46_WORKSPACE_SCOREBAR_20260926' "$ART/after/dashboard-v2-stage3.js" || { echo SCOREBAR_MARKER_MISSING; exit 1; }
grep -Fq "fixtures.filter(function(f){return classify(f)==='live'}).slice(0,10)" "$ART/after/dashboard-v2-stage3.js" || { echo SCOREBAR_CURRENT_LOGIC_UNEXPECTED; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-scan')
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('RUNTIME_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('CRON_CHANGED')
root.joinpath('locked-version.txt').write_text(vid)
root.joinpath('runtime-sha.txt').write_text(sha)
print('STEP1_CURRENT_PRODUCTION_LOCK_OK',vid,sha)
PY

find "$ART/after" -type f -printf '%P\n' | LC_ALL=C sort > "$VERIFY/live-paths.txt"
[ "$(wc -l < "$VERIFY/live-paths.txt" | tr -d ' ')" = 79 ] || { echo GENERATED_PATH_COUNT_BAD; exit 1; }
nonce="${GITHUB_RUN_ID}-scan-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/live/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/live/$rel"
  cmp -s "$ART/after/$rel" "$VERIFY/live/$rel" || { echo STEP1_CURRENT_ASSET_MISMATCH:$rel; exit 1; }
done < "$VERIFY/live-paths.txt"
echo STEP1_ALL_79_ASSETS_MATCH_CURRENT_PRODUCTION

cmp -s "$ART/after/dashboard-v2-stage3.js" "$VERIFY/live/dashboard-v2-stage3.js" || { echo STEP1_DASHBOARD_NOT_CURRENT; exit 1; }
grep -n 'BALL46_WORKSPACE_SCOREBAR_20260926\|function renderWorkspaceScorebar' "$VERIFY/live/dashboard-v2-stage3.js" > "$VERIFY/scorebar-marker.txt"
echo STEP1_SCOREBAR_TARGET_CONFIRMED

curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/board?scorebar_scan=$nonce" -o "$VERIFY/board.json"
python3 - <<'PY'
import json,datetime,pathlib
p=pathlib.Path('/tmp/b46-scorebar-scan/board.json');j=json.load(open(p));rows=j.get('fixtures') or []
if j.get('ok') is not True or not isinstance(rows,list):raise SystemExit('BOARD_BAD')
def kind(f):return str(f.get('boardState') or '').lower()
def ms(v):
 if isinstance(v,(int,float)):return float(v)
 if isinstance(v,str):
  try:return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()*1000
  except:return 0
 return 0
def kickoff(f):return ms(f.get('kickoffAt')) or ms(f.get('kickoffUtc'))
finished=sorted([f for f in rows if kind(f)=='finished'],key=lambda f:(kickoff(f),str(f.get('fixtureId') or '')),reverse=True)[:6]
live=sorted([f for f in rows if kind(f)=='live'],key=lambda f:((f.get('minute') if isinstance(f.get('minute'),(int,float)) else -1),kickoff(f),str(f.get('fixtureId') or '')),reverse=True)[:4]
def slim(f):
 g=f.get('goals') or {};return {'id':f.get('fixtureId'),'home':(f.get('home') or {}).get('name'),'away':(f.get('away') or {}).get('name'),'score':[g.get('home'),g.get('away')],'minute':f.get('minute'),'kickoffAt':f.get('kickoffAt'),'state':f.get('boardState')}
out={'total':len(rows),'finished_count':sum(kind(f)=='finished' for f in rows),'live_count':sum(kind(f)=='live' for f in rows),'scheduled_count':sum(kind(f)=='scheduled' for f in rows),'proposed_recent6':[slim(f) for f in finished],'proposed_near_ft4':[slim(f) for f in live]}
pathlib.Path('/tmp/b46-scorebar-scan/proposed-6x4.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print('STEP1_BOARD_COUNTS',out['total'],out['finished_count'],out['live_count'],out['scheduled_count'])
print('STEP1_PROPOSED_RECENT6',[(x['id'],x['score']) for x in out['proposed_recent6']])
print('STEP1_PROPOSED_NEAR_FT4',[(x['id'],x['minute']) for x in out['proposed_near_ft4']])
if len(finished)<1:raise SystemExit('NO_FINISHED_FIXTURES_FOR_PLAN')
print('STEP1_SCAN_SUCCESS_NO_DEPLOY')
PY
