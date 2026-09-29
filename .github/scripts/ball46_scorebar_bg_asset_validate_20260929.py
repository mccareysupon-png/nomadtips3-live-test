#!/usr/bin/env python3
from pathlib import Path
import base64, hashlib, binascii
root=Path('ops/ball46-scorebar-bg-20260929')
expected={
'win':('7c861eaa234f0936c7c15f9e8f485fd2f637e00ad1384a2a6c6fae9f04bdcb44',9054),
'loss':('1bc14f51dde1494ba89f11cc52e49dbf120b05972c648075b629a2d6fc4625bc',9678),
'draw':('77d2d91d1c65788c4a260ecff7c5bb91dded3246654169a586947cf98ddd2bbe',6618),
'pending':('2e6bc2f20d0122005cc9350f35c8f80e3fc20861e1b0ab0527b78d064745303c',8042),
}
def staged_text(name):
    if name=='loss':
        parts=sorted((root/'loss-parts').glob('*.b64'))
        if [p.name for p in parts] != [f'{i:02d}.b64' for i in range(1,10)]:
            raise SystemExit('STOP: LOSS chunk set incomplete')
        return ''.join(p.read_text().strip() for p in parts)
    return (root/f'{name}.webp.b64').read_text().strip()
out=[]; all_ok=True
Path('ball46-scorebar-bg-validated').mkdir(exist_ok=True)
for name,(sha,size) in expected.items():
    txt=staged_text(name)
    strict='OK'; raw=b''
    try: raw=base64.b64decode(txt,validate=True)
    except binascii.Error as e: strict=f'FAIL:{e}'
    got=hashlib.sha256(raw).hexdigest() if raw else '-'
    webp=(len(raw)>=12 and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')
    ok=(strict=='OK' and got==sha and len(raw)==size and webp)
    all_ok &= ok
    out.append(f'{name}: b64chars={len(txt)} mod4={len(txt)%4} strict={strict} bytes={len(raw)} sha256={got} webp={webp} expected={ok}')
    if raw: (Path('ball46-scorebar-bg-validated')/f'{name}.webp').write_bytes(raw)
Path('ball46-scorebar-bg-validated/report.txt').write_text('\n'.join(out)+'\n')
print('\n'.join(out))
if not all_ok: raise SystemExit('STOP: one or more staged assets do not exactly match source bytes')
print('ASSET_VALIDATE_OK')
