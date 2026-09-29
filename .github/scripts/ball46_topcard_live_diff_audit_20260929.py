#!/usr/bin/env python3
from pathlib import Path
import urllib.request, difflib, hashlib, json, re
ROOT=Path('ball46-topcard-candidate-20260929')
BASE='https://www.ball46.com/'
files=['dashboard-v2-stage3.js','singlepage-workspace-343.css','index.html']
def fetch(name):
 req=urllib.request.Request(BASE+name+'?audit=20260929',headers={'User-Agent':'Ball46-TopCard-Live-Diff/20260929','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode('utf-8','replace')
live={n:fetch(n) for n in files}; cand={n:(ROOT/n).read_text(encoding='utf-8') for n in files}
report=[]
report.append('BALL46 TOP CARD LIVE DIFF AUDIT 2026-09-29')
report.append('NO DEPLOY / READ ONLY')
for n in files:
 report.append(f'{n} LIVE sha256={hashlib.sha256(live[n].encode()).hexdigest()} bytes={len(live[n].encode())}')
 report.append(f'{n} CAND sha256={hashlib.sha256(cand[n].encode()).hexdigest()} bytes={len(cand[n].encode())}')
# JS: candidate may differ only inside renderWorkspaceScorebar.
def function_span(src,name):
 needle=f'function {name}('; s=src.find(needle)
 if s<0: raise SystemExit('STOP: '+name+' missing')
 b=src.find('{',s); depth=0;quote=None;esc=False
 for i in range(b,len(src)):
  c=src[i]
  if quote:
   if esc: esc=False
   elif c=='\\': esc=True
   elif c==quote: quote=None
  else:
   if c in "'\"`": quote=c
   elif c=='{': depth+=1
   elif c=='}':
    depth-=1
    if depth==0:return s,i+1
 raise SystemExit('STOP: unbalanced '+name)
ls,le=function_span(live['dashboard-v2-stage3.js'],'renderWorkspaceScorebar'); cs,ce=function_span(cand['dashboard-v2-stage3.js'],'renderWorkspaceScorebar')
if live['dashboard-v2-stage3.js'][:ls]!=cand['dashboard-v2-stage3.js'][:cs] or live['dashboard-v2-stage3.js'][le:]!=cand['dashboard-v2-stage3.js'][ce:]:
 raise SystemExit('STOP: candidate JS differs outside renderWorkspaceScorebar')
report.append(f'JS_SCOPE_OK only renderWorkspaceScorebar differs; live_fn={le-ls} candidate_fn={ce-cs}')
# Protected wiring/API counts unchanged.
for token in ['/api/engine/','ENGINE','FULL_MARKET','HUB','workers.dev']:
 a=live['dashboard-v2-stage3.js'].count(token); b=cand['dashboard-v2-stage3.js'].count(token)
 if a!=b: raise SystemExit(f'STOP: protected token count changed {token}: {a}->{b}')
 report.append(f'PROTECTED {token} count={a} unchanged')
# CSS: exactly original live plus our marked append block.
marker='/* BALL46_SCOREBAR_DETAILS_20260929'
pos=cand['singlepage-workspace-343.css'].find(marker)
if pos<0: raise SystemExit('STOP: CSS marker missing')
base=cand['singlepage-workspace-343.css'][:pos].rstrip()
if base!=live['singlepage-workspace-343.css'].rstrip(): raise SystemExit('STOP: candidate CSS differs from current live before the isolated append block')
report.append('CSS_SCOPE_OK candidate equals current live CSS plus one marked append block')
# Index: exact two cache busters only; restore them and require byte-equivalent text.
restored=cand['index.html'].replace('dashboard-v2-stage3.js?v=343-scorebar-details-20260929a','dashboard-v2-stage3.js?v=343-scorebar-bg-pending-20260928a').replace('singlepage-workspace-343.css?v=343-scorebar-details-20260929a','singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a')
if restored!=live['index.html']: raise SystemExit('STOP: candidate index differs from current live beyond two approved cache-busters')
report.append('INDEX_SCOPE_OK exactly two approved cache-busters differ')
# Compact function diff for review.
lf=live['dashboard-v2-stage3.js'][ls:le].splitlines(); cf=cand['dashboard-v2-stage3.js'][cs:ce].splitlines()
report.append('--- RENDERER DIFF ---')
report.extend(difflib.unified_diff(lf,cf,fromfile='live/renderWorkspaceScorebar',tofile='candidate/renderWorkspaceScorebar',lineterm=''))
report.append('GATE=PASS: current live files match candidate base and all candidate changes are isolated to approved UI scope')
Path('ball46-topcard-live-diff-audit-20260929.txt').write_text('\n'.join(report),encoding='utf-8')
print('\n'.join(report[:20])); print(report[-1])
