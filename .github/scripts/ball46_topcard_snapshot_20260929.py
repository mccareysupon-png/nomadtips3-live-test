#!/usr/bin/env python3
import urllib.request, pathlib, hashlib, json
BASE='https://www.ball46.com'
OUT=pathlib.Path('ball46-topcard-candidate-20260929')
OUT.mkdir(exist_ok=True)
files=['dashboard-v2-stage3.js','dashboard-v2-tune.css','index.html']
manifest={}
for name in files:
    req=urllib.request.Request(f'{BASE}/{name}?snapshot=20260929',headers={'User-Agent':'Ball46-TopCard-Snapshot/20260929','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=40) as r:data=r.read()
    (OUT/name).write_bytes(data)
    manifest[name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
