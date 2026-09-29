#!/usr/bin/env python3
import json, re, urllib.request, pathlib, sys, datetime
ROOT = pathlib.Path('/tmp/ball46-topcard-inspect')
ROOT.mkdir(parents=True, exist_ok=True)
BASE = 'https://www.ball46.com'
files = {
    'dashboard-v2-stage3.js': f'{BASE}/dashboard-v2-stage3.js?inspect=20260929',
    'dashboard-v2-tune.css': f'{BASE}/dashboard-v2-tune.css?inspect=20260929',
    'index.html': f'{BASE}/index.html?inspect=20260929',
    'board.json': f'{BASE}/api/engine/board?inspect=20260929',
    'signals.json': f'{BASE}/api/engine/signals?inspect=20260929',
    'statistics.json': f'{BASE}/api/engine/statistics?inspect=20260929',
}

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Ball46-TopCard-Inspect/20260929','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

for name, url in files.items():
    data = fetch(url)
    (ROOT/name).write_bytes(data)

js = (ROOT/'dashboard-v2-stage3.js').read_text(errors='replace')
css = (ROOT/'dashboard-v2-tune.css').read_text(errors='replace')
idx = (ROOT/'index.html').read_text(errors='replace')

TOKENS = [
    'renderBoard','renderFeatured','match-row','teams-cell','score-cell','market-cell','signal-cell',
    'workspace-scorebar','desktop-team-score','entry','ENTRY','minute','score','odds','market','selection',
    'corner','corners','result','status','half-score'
]

def snippet(text, token, radius=420):
    p = text.find(token)
    if p < 0:
        return None
    s = max(0, p-radius); e=min(len(text), p+len(token)+radius)
    return text[s:e].replace('\n',' ')

def shape(obj, depth=0, max_depth=3):
    if depth > max_depth:
        return type(obj).__name__
    if isinstance(obj, dict):
        out={}
        for k,v in list(obj.items())[:80]:
            out[k]=shape(v, depth+1, max_depth)
        return out
    if isinstance(obj, list):
        return [shape(obj[0], depth+1, max_depth)] if obj else []
    return type(obj).__name__

def first_item(obj):
    if isinstance(obj, list): return obj[0] if obj else None
    if isinstance(obj, dict):
        for k in ['data','matches','fixtures','signals','rows','items','results','statistics','board']:
            v=obj.get(k)
            if isinstance(v,list) and v: return v[0]
        for v in obj.values():
            if isinstance(v,list) and v: return v[0]
    return None

def collect_keys(obj, wanted, path='', depth=0, out=None):
    if out is None: out=[]
    if depth>6: return out
    if isinstance(obj, dict):
        for k,v in obj.items():
            p=f'{path}.{k}' if path else k
            lk=k.lower()
            if any(w in lk for w in wanted):
                val=v
                if isinstance(val,(dict,list)): val=f'<{type(val).__name__}>'
                out.append((p,val))
            collect_keys(v,wanted,p,depth+1,out)
    elif isinstance(obj,list):
        for i,v in enumerate(obj[:2]): collect_keys(v,wanted,f'{path}[{i}]',depth+1,out)
    return out

report=[]
report.append('BALL46 TOP CARD INSPECTION 2026-09-29')
report.append('UTC '+datetime.datetime.utcnow().isoformat()+'Z')
report.append('NO DEPLOY / NO MUTATION OF PRODUCTION')
report.append('')
report.append('ASSET SIZES')
for n in ['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']:
    report.append(f'- {n}: {(ROOT/n).stat().st_size} bytes')
report.append('')
report.append('INDEX REFERENCES')
for pat in ['dashboard-v2-stage3.js','dashboard-v2-tune.css']:
    m=re.search(r'[^\"\']*'+re.escape(pat)+r'[^\"\']*',idx)
    report.append(f'- {pat}: {m.group(0) if m else "NOT_FOUND"}')
report.append('')
report.append('JS TOKEN COUNTS')
for t in TOKENS:
    report.append(f'- {t}: {js.count(t)}')
report.append('')
report.append('KEY JS SNIPPETS')
for t in ['renderBoard','renderFeatured','match-row','teams-cell','score-cell','market-cell','signal-cell','workspace-scorebar','desktop-team-score','corner','corners','ENTRY','entry']:
    sn=snippet(js,t)
    report.append(f'[{t}] {sn if sn else "NOT_FOUND"}')
report.append('')
report.append('CSS SNIPPETS')
for t in ['match-row','teams-cell','score-cell','market-cell','signal-cell','workspace-scorebar','desktop-team-score']:
    sn=snippet(css,t,520)
    report.append(f'[{t}] {sn if sn else "NOT_FOUND"}')
report.append('')

wanted=['corner','entry','minute','time','score','odds','market','selection','result','status','signal','line','pick','home','away','ft']
for api in ['board','signals','statistics']:
    obj=json.loads((ROOT/f'{api}.json').read_text(errors='replace'))
    report.append(f'{api.upper()} TOP LEVEL: {list(obj.keys()) if isinstance(obj,dict) else type(obj).__name__}')
    report.append(f'{api.upper()} SHAPE: {json.dumps(shape(obj), ensure_ascii=False)[:7000]}')
    sample=first_item(obj)
    report.append(f'{api.upper()} FIRST ITEM TYPE: {type(sample).__name__}')
    if sample is not None:
        pairs=collect_keys(sample,wanted)
        for p,v in pairs[:220]:
            report.append(f'  {p} = {repr(v)[:500]}')
    report.append('')

# Safety assertions: inspection only, public GETs only.
if 'match-row' not in js or 'score-cell' not in js:
    report.append('GATE=STOP: expected shared card markers missing in current Production JS')
else:
    report.append('GATE=PASS: shared card markers present in current Production JS')

path=pathlib.Path('ball46-topcard-inspection-20260929.txt')
path.write_text('\n'.join(report), encoding='utf-8')
print('\n'.join(report[-12:]))
print('REPORT_FILE', path)
