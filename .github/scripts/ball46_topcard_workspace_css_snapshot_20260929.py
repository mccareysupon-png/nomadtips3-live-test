#!/usr/bin/env python3
import urllib.request, pathlib, hashlib
name='singlepage-workspace-343.css'
url='https://www.ball46.com/'+name+'?snapshot=20260929'
req=urllib.request.Request(url,headers={'User-Agent':'Ball46-TopCard-CSS-Snapshot/20260929','Cache-Control':'no-cache'})
with urllib.request.urlopen(req,timeout=40) as r:data=r.read()
out=pathlib.Path('ball46-topcard-candidate-20260929')/name
out.parent.mkdir(exist_ok=True)
out.write_bytes(data)
print(name,len(data),hashlib.sha256(data).hexdigest())
