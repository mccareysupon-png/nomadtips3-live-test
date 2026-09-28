#!/usr/bin/env bash
set -euo pipefail
ART="/tmp/b46-scorebar-base"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
WORK="/tmp/b46-scorebar-prepare"
AFTER="$WORK/after"
VERIFY="$WORK/verify"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
rm -rf "$WORK" && mkdir -p "$AFTER" "$VERIFY/live" "$WORK/runtime"

[ "$(find "$ART/after" -type f | wc -l | tr -d ' ')" = 79 ] || { echo STEP2_BASE_ASSET_COUNT_BAD; exit 1; }
cp -a "$ART/after/." "$AFTER/"
cp "$ART/runtime-current.bin" "$WORK/runtime/index.js"
[ "$(sha256sum "$WORK/runtime/index.js" | awk '{print $1}')" = "$EXPECTED_RUNTIME_SHA" ] || { echo STEP2_RUNTIME_ARTIFACT_BAD; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-prepare/verify');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('STEP2_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1:raise SystemExit('STEP2_INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('STEP2_RUNTIME_SHA_CHANGED:'+sha)
root.joinpath('locked-version.txt').write_text(vid)
print('STEP2_PRODUCTION_LOCK_OK',vid,sha)
PY

find "$ART/after" -type f -printf '%P\n' | LC_ALL=C sort > "$VERIFY/live-paths.txt"
nonce="${GITHUB_RUN_ID}-prepare-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/live/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/live/$rel"
  cmp -s "$ART/after/$rel" "$VERIFY/live/$rel" || { echo STEP2_PRODUCTION_MOVED_ASSET:$rel; exit 1; }
done < "$VERIFY/live-paths.txt"
echo STEP2_CURRENT_79_MATCH_BASE

python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-scorebar-prepare/after/dashboard-v2-stage3.js');s=p.read_text()
old="""/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */
function renderWorkspaceScorebar(){
  const slot=document.querySelector('[data-workspace-scorebar-slot]');
  if(!slot)return;
  const rows=fixtures.filter(function(f){return classify(f)==='live'}).slice(0,10);
  const cells=rows.map(function(f){
    const id=fixtureKey(f),p=scorePair(f),score=(p.home===null||p.away===null)?'—':(show(p.home)+'–'+show(p.away));
    return '<button type="button" class="workspace-scorebar-cell" data-workspace-score-id="'+esc(id)+'"><span class="workspace-scorebar-meta"><i>'+esc(detailedStatus(f))+'</i><b>'+esc(score)+'</b></span><span>'+esc(f?.home?.name||'—')+'</span><span class="away">'+esc(f?.away?.name||'—')+'</span></button>';
  });
  while(cells.length<10){
    const first=cells.length===0;
    cells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(first?'No live matches':'—')+'</span><span class="away">—</span></div>');
  }
  slot.innerHTML='<div class="workspace-scorebar-grid">'+cells.join('')+'</div>';
  /* BALL46_SCOREBAR_READONLY_20260926 — visual/data unchanged; click disabled only */slot.querySelectorAll('[data-workspace-score-id]').forEach(function(btn){btn.onclick=null});
}
"""
new="""/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */
/* BALL46_SCOREBAR_6X4_20260928 — 6 recent FT + 4 nearest-to-FT live; same board data, zero extra requests */
function renderWorkspaceScorebar(){
  const slot=document.querySelector('[data-workspace-scorebar-slot]');
  if(!slot)return;
  const kickoffMs=function(f){return dateMs(f?.kickoffAt??f?.kickoffUtc)??0};
  const recent=fixtures.filter(function(f){return classify(f)==='finished'}).slice().sort(function(a,b){return kickoffMs(b)-kickoffMs(a)||String(fixtureKey(b)).localeCompare(String(fixtureKey(a)))}).slice(0,6);
  const nearFt=fixtures.filter(function(f){return classify(f)==='live'}).slice().sort(function(a,b){return (num(b?.minute)??-1)-(num(a?.minute)??-1)||kickoffMs(b)-kickoffMs(a)||String(fixtureKey(b)).localeCompare(String(fixtureKey(a)))}).slice(0,4);
  const makeCell=function(f){
    const id=fixtureKey(f),p=scorePair(f),score=(p.home===null||p.away===null)?'—':(show(p.home)+'–'+show(p.away));
    return '<button type="button" class="workspace-scorebar-cell" data-workspace-score-id="'+esc(id)+'"><span class="workspace-scorebar-meta"><i>'+esc(detailedStatus(f))+'</i><b>'+esc(score)+'</b></span><span>'+esc(f?.home?.name||'—')+'</span><span class="away">'+esc(f?.away?.name||'—')+'</span></button>';
  };
  const resultCells=recent.map(makeCell),liveCells=nearFt.map(makeCell);
  while(resultCells.length<6)resultCells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(resultCells.length===0?'No recent results':'—')+'</span><span class="away">—</span></div>');
  while(liveCells.length<4)liveCells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(liveCells.length===0?'No late live matches':'—')+'</span><span class="away">—</span></div>');
  const cells=resultCells.concat(liveCells);
  slot.innerHTML='<div class="workspace-scorebar-grid">'+cells.join('')+'</div>';
  /* BALL46_SCOREBAR_READONLY_20260926 — visual/data unchanged; click disabled only */slot.querySelectorAll('[data-workspace-score-id]').forEach(function(btn){btn.onclick=null});
}
"""
if s.count(old)!=1:raise SystemExit('STEP2_EXACT_SCOREBAR_BLOCK_NOT_UNIQUE')
p.write_text(s.replace(old,new,1))
print('STEP2_EXACT_SCOREBAR_PATCH_APPLIED')
PY

node --check "$AFTER/dashboard-v2-stage3.js"
grep -Fq 'BALL46_SCOREBAR_6X4_20260928' "$AFTER/dashboard-v2-stage3.js"
echo STEP2_JS_SYNTAX_AND_MARKER_OK

python3 - <<'PY'
import hashlib,pathlib
before=pathlib.Path('/tmp/b46-scorebar-base/after');after=pathlib.Path('/tmp/b46-scorebar-prepare/after')
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
changed=[]
for p in sorted(before.rglob('*')):
 if p.is_file():
  rel=p.relative_to(before);q=after/rel
  if not q.is_file() or h(p)!=h(q):changed.append(str(rel))
extra=[str(p.relative_to(after)) for p in after.rglob('*') if p.is_file() and not (before/p.relative_to(after)).exists()]
print('STEP2_CHANGED_ASSETS',changed,'EXTRA',extra)
if changed!=['dashboard-v2-stage3.js'] or extra:raise SystemExit('STEP2_DIFF_GATE_FAILED')
pathlib.Path('/tmp/b46-scorebar-prepare/verify/changed-assets.txt').write_text('\n'.join(changed)+'\n')
print('STEP2_ONE_FILE_DIFF_GATE_PASS')
PY

curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/board?scorebar_prepare=$nonce" -o "$VERIFY/board.json"
python3 - <<'PY'
import json,datetime,pathlib
j=json.load(open('/tmp/b46-scorebar-prepare/verify/board.json'));rows=j.get('fixtures') or []
if j.get('ok') is not True:raise SystemExit('STEP2_BOARD_BAD')
def kind(f):return str(f.get('boardState') or '').lower()
def ms(v):
 if isinstance(v,(int,float)):return float(v)
 if isinstance(v,str):
  try:return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()*1000
  except:return 0
 return 0
def ko(f):return ms(f.get('kickoffAt')) or ms(f.get('kickoffUtc'))
recent=sorted([f for f in rows if kind(f)=='finished'],key=lambda f:(ko(f),str(f.get('fixtureId') or '')),reverse=True)[:6]
near=sorted([f for f in rows if kind(f)=='live'],key=lambda f:((f.get('minute') if isinstance(f.get('minute'),(int,float)) else -1),ko(f),str(f.get('fixtureId') or '')),reverse=True)[:4]
mins=[f.get('minute') for f in near]
if len(recent)>6 or len(near)>4:raise SystemExit('STEP2_SLOT_COUNT_BAD')
if any(isinstance(mins[i],(int,float)) and isinstance(mins[i+1],(int,float)) and mins[i]<mins[i+1] for i in range(len(mins)-1)):raise SystemExit('STEP2_LIVE_ORDER_BAD')
out={'recent6':[f.get('fixtureId') for f in recent],'nearFt4':[(f.get('fixtureId'),f.get('minute')) for f in near]}
pathlib.Path('/tmp/b46-scorebar-prepare/verify/selection.json').write_text(json.dumps(out,indent=2))
print('STEP2_SELECTION_OK',out)
PY

cat > "$WORK/runtime/wrangler.jsonc" <<'EOF'
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
  "assets":{"directory":"/tmp/b46-scorebar-prepare/after","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF
cd "$WORK/runtime"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo STEP2_DRY_EXTRA_MODULES; exit 1; }
echo STEP2_DRY_RUN_PASS_NO_DEPLOY
