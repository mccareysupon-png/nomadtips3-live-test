#!/usr/bin/env python3
from pathlib import Path
import urllib.request
ROOT=Path('ball46-topcard-candidate-20260929')
TUNE=ROOT/'dashboard-v2-tune.css'
WORK=ROOT/'singlepage-workspace-343.css'
IDX=ROOT/'index.html'
PREVIEW=Path('.github/scripts/ball46_topcard_browser_preview_20260929.js')
PATCHER=Path('.github/scripts/ball46_topcard_patch_20260929.py')

for p in [TUNE,WORK,IDX,PREVIEW,PATCHER]:
    if not p.exists(): raise SystemExit('STOP missing '+str(p))

def live(name):
    req=urllib.request.Request('https://www.ball46.com/'+name+'?migrate_tune=20260929',headers={'User-Agent':'Ball46-TopCard-Tune-Migrate/20260929','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode('utf-8','replace')

live_tune=live('dashboard-v2-tune.css')
live_work=live('singlepage-workspace-343.css')
# Candidate tune must still be exact live before this isolated append.
if TUNE.read_text(encoding='utf-8').rstrip()!=live_tune.rstrip():
    raise SystemExit('STOP candidate tune CSS drifted from current Production')

block='''\n/* BALL46_SCOREBAR_DETAILS_20260929 — presentation only; keep existing score/time row in place. */
@media(min-width:761px){
  .workspace-scorebar-slot{height:120px!important;min-height:120px!important;max-height:120px!important}
  .workspace-scorebar-grid{height:118px!important}
  .workspace-scorebar-cell{height:118px!important}
  .workspace-scorebar-details{display:grid;grid-template-columns:minmax(0,1fr) 26px minmax(0,1fr);align-items:center;gap:3px;margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,.22);font-size:8px;line-height:1.05;white-space:nowrap;min-width:0}
  .workspace-scorebar-details>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
  .workspace-scorebar-detail-entry,.workspace-scorebar-detail-current{display:flex;flex-direction:column;gap:1px}
  .workspace-scorebar-detail-current{text-align:right;align-items:flex-end}
  .workspace-scorebar-details i{font-style:normal;font-size:7px;font-weight:800;letter-spacing:.35px;opacity:.78}
  .workspace-scorebar-details b{font-size:8px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .workspace-scorebar-detail-minute{text-align:center;font-weight:900;font-size:8px;color:#fff}
}
'''
TUNE.write_text(live_tune.rstrip()+block+'\n',encoding='utf-8')
# Explicitly remove the prior experimental workspace-CSS append by restoring current live byte-for-byte text.
WORK.write_text(live_work,encoding='utf-8')

idx=IDX.read_text(encoding='utf-8')
# JS cache buster stays candidate. Workspace ref returns to current Production; tune becomes candidate.
if idx.count('singlepage-workspace-343.css?v=343-scorebar-details-20260929a')!=1:
    raise SystemExit('STOP expected candidate workspace cache-buster missing')
if idx.count('dashboard-v2-tune.css?v=343-horizontal-card-20260928a')!=1:
    raise SystemExit('STOP expected production tune cache-buster missing')
idx=idx.replace('singlepage-workspace-343.css?v=343-scorebar-details-20260929a','singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a')
idx=idx.replace('dashboard-v2-tune.css?v=343-horizontal-card-20260928a','dashboard-v2-tune.css?v=343-scorebar-details-20260929a')
IDX.write_text(idx,encoding='utf-8')

# Browser preview intercepts tune CSS only; workspace CSS comes untouched from live.
p=PREVIEW.read_text(encoding='utf-8')
repls={
"const candidateCss=fs.readFileSync(path.join(ROOT,'singlepage-workspace-343.css'),'utf8');":"const candidateCss=fs.readFileSync(path.join(ROOT,'dashboard-v2-tune.css'),'utf8');",
"await page.route('**/singlepage-workspace-343.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:candidateCss}));":"await page.route('**/dashboard-v2-tune.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:candidateCss}));",
"if(Math.abs(state.slotHeight-80)>1.5)throw new Error(name+': slot height '+state.slotHeight+' != 80');":"if(Math.abs(state.slotHeight-120)>1.5)throw new Error(name+': slot height '+state.slotHeight+' != 120');",
"if(Math.abs(state.gridHeight-78)>1.5)throw new Error(name+': grid height '+state.gridHeight+' != 78');":"if(Math.abs(state.gridHeight-118)>1.5)throw new Error(name+': grid height '+state.gridHeight+' != 118');",
"if(Math.abs(c.height-78)>1.5)throw new Error(name+': card height '+c.height+' != 78');":"if(Math.abs(c.height-118)>1.5)throw new Error(name+': card height '+c.height+' != 118');"
}
for a,b in repls.items():
    n=p.count(a)
    if n!=1: raise SystemExit(f'STOP preview replacement count {n} for {a[:50]}')
    p=p.replace(a,b)
PREVIEW.write_text(p,encoding='utf-8')

# Keep patch generator reproducible with the safer three-asset route.
q=PATCHER.read_text(encoding='utf-8')
q=q.replace("CSS=ROOT/'singlepage-workspace-343.css'","CSS=ROOT/'dashboard-v2-tune.css'")
q=q.replace("old_css_ref='singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a'","old_css_ref='dashboard-v2-tune.css?v=343-horizontal-card-20260928a'")
q=q.replace("idx2=idx2.replace(old_css_ref,'singlepage-workspace-343.css?v=343-scorebar-details-20260929a')","idx2=idx2.replace(old_css_ref,'dashboard-v2-tune.css?v=343-scorebar-details-20260929a')")
# Patcher's CSS block should use proven 120/118 values if rebuilt from fresh live assets.
q=q.replace('.workspace-scorebar-slot{height:80px;min-height:80px;max-height:80px}','.workspace-scorebar-slot{height:120px;min-height:120px;max-height:120px}')
q=q.replace('.workspace-scorebar-grid{height:78px}','.workspace-scorebar-grid{height:118px}')
q=q.replace('.workspace-scorebar-cell{height:78px}','.workspace-scorebar-cell{height:118px}')
PATCHER.write_text(q,encoding='utf-8')

print('MIGRATE_TUNE_OK')
print('approved deploy candidates: dashboard-v2-stage3.js, dashboard-v2-tune.css, index.html')
print('workspace CSS restored to current Production')
