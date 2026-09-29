#!/usr/bin/env python3
from pathlib import Path
import base64, hashlib, struct
root=Path('ops/ball46-scorebar-bg-20260929')
expected={
'win':('7c861eaa234f0936c7c15f9e8f485fd2f637e00ad1384a2a6c6fae9f04bdcb44',9054),
'loss':('1bc14f51dde1494ba89f11cc52e49dbf120b05972c648075b629a2d6fc4625bc',9678),
'draw':('77d2d91d1c65788c4a260ecff7c5bb91dded3246654169a586947cf98ddd2bbe',6618),
'pending':('2e6bc2f20d0122005cc9350f35c8f80e3fc20861e1b0ab0527b78d064745303c',8042),
}
out=[]
for name,(sha,size) in expected.items():
    raw=base64.b64decode((root/f'{name}.webp.b64').read_text().strip(),validate=True)
    got=hashlib.sha256(raw).hexdigest()
    ok=(got==sha and len(raw)==size and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')
    out.append(f'{name}: bytes={len(raw)} sha256={got} webp={raw[:4]==b"RIFF" and raw[8:12]==b"WEBP"} expected={ok}')
    (Path('ball46-scorebar-bg-validated')/f'{name}.webp').parent.mkdir(exist_ok=True)
    (Path('ball46-scorebar-bg-validated')/f'{name}.webp').write_bytes(raw)
    if not ok: raise SystemExit('STOP asset mismatch '+name)
Path('ball46-scorebar-bg-validated/report.txt').write_text('\n'.join(out)+'\n')
print('\n'.join(out)); print('ASSET_VALIDATE_OK')
