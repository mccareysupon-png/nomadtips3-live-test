#!/usr/bin/env python3
from pathlib import Path

def one(path, old, new):
    p=Path(path); s=p.read_text(encoding='utf-8'); n=s.count(old)
    if n!=1: raise SystemExit(f'STOP: expected exactly 1 occurrence in {path}: {old!r}; found {n}')
    p.write_text(s.replace(old,new),encoding='utf-8')
    print('UPDATED',path,old,'=>',new)

# Candidate CSS: browser proved 78px clips real content (~116px scroll height).
one('ball46-topcard-candidate-20260929/singlepage-workspace-343.css',
    '.workspace-scorebar-slot{height:80px;min-height:80px;max-height:80px}',
    '.workspace-scorebar-slot{height:120px;min-height:120px;max-height:120px}')
one('ball46-topcard-candidate-20260929/singlepage-workspace-343.css',
    '.workspace-scorebar-grid{height:78px}', '.workspace-scorebar-grid{height:118px}')
one('ball46-topcard-candidate-20260929/singlepage-workspace-343.css',
    '.workspace-scorebar-cell{height:78px}', '.workspace-scorebar-cell{height:118px}')

# Keep the guarded patch generator reproducible at the proven height.
one('.github/scripts/ball46_topcard_patch_20260929.py',
    '.workspace-scorebar-slot{height:80px;min-height:80px;max-height:80px}',
    '.workspace-scorebar-slot{height:120px;min-height:120px;max-height:120px}')
one('.github/scripts/ball46_topcard_patch_20260929.py',
    '.workspace-scorebar-grid{height:78px}', '.workspace-scorebar-grid{height:118px}')
one('.github/scripts/ball46_topcard_patch_20260929.py',
    '.workspace-scorebar-cell{height:78px}', '.workspace-scorebar-cell{height:118px}')

# Browser preview geometry expectations.
one('.github/scripts/ball46_topcard_browser_preview_20260929.js',
    "if(Math.abs(state.slotHeight-80)>1.5)throw new Error(name+': slot height '+state.slotHeight+' != 80');",
    "if(Math.abs(state.slotHeight-120)>1.5)throw new Error(name+': slot height '+state.slotHeight+' != 120');")
one('.github/scripts/ball46_topcard_browser_preview_20260929.js',
    "if(Math.abs(state.gridHeight-78)>1.5)throw new Error(name+': grid height '+state.gridHeight+' != 78');",
    "if(Math.abs(state.gridHeight-118)>1.5)throw new Error(name+': grid height '+state.gridHeight+' != 118');")
one('.github/scripts/ball46_topcard_browser_preview_20260929.js',
    "if(Math.abs(c.height-78)>1.5)throw new Error(name+': card height '+c.height+' != 78');",
    "if(Math.abs(c.height-118)>1.5)throw new Error(name+': card height '+c.height+' != 118');")

# Build audit expectation only; no production mutation.
one('.github/workflows/ball46-topcard-build-20260929.yml',
    "assert '.workspace-scorebar-slot{height:80px;min-height:80px;max-height:80px}' in css",
    "assert '.workspace-scorebar-slot{height:120px;min-height:120px;max-height:120px}' in css")
print('HEIGHT_ADJUST_OK')
