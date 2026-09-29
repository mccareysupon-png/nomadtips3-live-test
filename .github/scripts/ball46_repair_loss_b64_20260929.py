#!/usr/bin/env python3
from pathlib import Path
import base64,hashlib
p=Path('ops/ball46-scorebar-bg-20260929/loss.webp.b64')
bad=p.read_text().strip()
target=bytes.fromhex('1bc14f51dde1494ba89f11cc52e49dbf120b05972c648075b629a2d6fc4625bc')
alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
if len(bad)!=12903: raise SystemExit(f'STOP unexpected loss b64 length {len(bad)}')
found=[]
for i in range(len(bad)+1):
    left,right=bad[:i],bad[i:]
    for ch in alphabet:
        cand=left+ch+right
        try: raw=base64.b64decode(cand,validate=True)
        except Exception: continue
        if len(raw)==9678 and hashlib.sha256(raw).digest()==target:
            found.append((i,ch,cand))
            print('FOUND',i,repr(ch),hashlib.sha256(raw).hexdigest())
            if len(found)>1: raise SystemExit('STOP multiple valid repairs found')
if len(found)!=1: raise SystemExit(f'STOP expected exactly one repair, found {len(found)}')
i,ch,cand=found[0]
p.write_text(cand+'\n')
raw=base64.b64decode(cand,validate=True)
assert len(cand)==12904 and len(raw)==9678 and hashlib.sha256(raw).hexdigest()=='1bc14f51dde1494ba89f11cc52e49dbf120b05972c648075b629a2d6fc4625bc'
print('REPAIR_OK position',i,'character',repr(ch))
