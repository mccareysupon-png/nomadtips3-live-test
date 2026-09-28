#!/usr/bin/env bash
set -euo pipefail
SRC='.github/scripts/ball46_scorebar_height70_predeploy_20260928.sh'
TMP='/tmp/ball46_scorebar_height70_predeploy_v3.sh'
cp "$SRC" "$TMP"
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/ball46_scorebar_height70_predeploy_v3.sh');s=p.read_text()
old1="""def patch_rule(src,selector,changes):
  matches=[]
  for m in re.finditer(r'([^{}]+)\\{([^{}]*)\\}',src,re.S):
    if clean(m.group(1))==selector:matches.append(m)
  if len(matches)!=1:raise SystemExit('RULE_COUNT_BAD:'+selector+':'+str(len(matches)))
  m=matches[0];body=m.group(2);new=body
  for prop,old,newv in changes:
    pat=re.compile(r'(?<![-\\w])'+re.escape(prop)+r'\\s*:\\s*'+re.escape(old)+r'(?=\\s*[;!}])')
    hits=list(pat.finditer(new))
    if len(hits)!=1:raise SystemExit(f'DECL_COUNT_BAD:{selector}:{prop}:{old}:{len(hits)}')
    new=pat.sub(f'{prop}:{newv}',new,count=1)
  return src[:m.start(2)]+new+src[m.end(2):]
"""
new1="""def patch_rule(src,selector,changes):
  matches=[]
  for m in re.finditer(r'([^{}]+)\\{([^{}]*)\\}',src,re.S):
    if clean(m.group(1))!=selector: continue
    body=m.group(2); ok=True
    for prop,old,newv in changes:
      pat=re.compile(r'(?<![-\\w])'+re.escape(prop)+r'\\s*:\\s*'+re.escape(old)+r'(?=\\s*[;!}])')
      if len(list(pat.finditer(body)))!=1: ok=False; break
    if ok: matches.append(m)
  if len(matches)!=1:raise SystemExit('TARGET_RULE_COUNT_BAD:'+selector+':'+str(len(matches)))
  m=matches[0];body=m.group(2);new=body
  for prop,old,newv in changes:
    pat=re.compile(r'(?<![-\\w])'+re.escape(prop)+r'\\s*:\\s*'+re.escape(old)+r'(?=\\s*[;!}])')
    new=pat.sub(f'{prop}:{newv}',new,count=1)
  return src[:m.start(2)]+new+src[m.end(2):]
"""
old2="""# Prove CSS changed only the five intended numeric declarations.
norm=lambda s: s.replace('height:60px','height:__SLOT__',1).replace('min-height:60px','min-height:__SLOT__',1).replace('max-height:60px','max-height:__SLOT__',1).replace('height:58px','height:__GRID__',1).replace('height:58px','height:__CELL__',1)
norm2=lambda s: s.replace('height:72px','height:__SLOT__',1).replace('min-height:72px','min-height:__SLOT__',1).replace('max-height:72px','max-height:__SLOT__',1).replace('height:70px','height:__GRID__',1).replace('height:70px','height:__CELL__',1)
if norm(base)!=norm2(css):raise SystemExit('CSS_UNRELATED_CHANGE')
"""
new2="""# Prove CSS changed only the five intended declarations, scoped to exact rules.
def normalize_rule(src,selector,pairs):
  matches=[]
  for m in re.finditer(r'([^{}]+)\\{([^{}]*)\\}',src,re.S):
    if clean(m.group(1))!=selector: continue
    body=m.group(2); ok=True
    for prop,val,token in pairs:
      pat=re.compile(r'(?<![-\\w])'+re.escape(prop)+r'\\s*:\\s*'+re.escape(val)+r'(?=\\s*[;!}])')
      if len(list(pat.finditer(body)))!=1: ok=False; break
    if ok: matches.append(m)
  if len(matches)!=1: raise SystemExit('NORMALIZE_RULE_COUNT_BAD:'+selector+':'+str(len(matches)))
  m=matches[0];body=m.group(2);new=body
  for prop,val,token in pairs:
    pat=re.compile(r'(?<![-\\w])'+re.escape(prop)+r'\\s*:\\s*'+re.escape(val)+r'(?=\\s*[;!}])')
    new=pat.sub(f'{prop}:{token}',new,count=1)
  return src[:m.start(2)]+new+src[m.end(2):]
def normalize_all(src,slot,card):
  src=normalize_rule(src,'.workspace-scorebar-slot',[('height',slot,'__SLOT__'),('min-height',slot,'__SLOT__'),('max-height',slot,'__SLOT__')])
  src=normalize_rule(src,'.workspace-scorebar-grid',[('height',card,'__GRID__')])
  src=normalize_rule(src,'.workspace-scorebar-cell',[('height',card,'__CELL__')])
  return src
if normalize_all(base,'60px','58px')!=normalize_all(css,'72px','70px'):raise SystemExit('CSS_UNRELATED_CHANGE')
print('SELECTOR_SCOPED_STRUCTURE_PROOF_PASS')
"""
if old1 not in s: raise SystemExit('PATCH_FUNCTION_TEMPLATE_NOT_FOUND')
if old2 not in s: raise SystemExit('STRUCTURE_TEMPLATE_NOT_FOUND')
s=s.replace(old1,new1,1).replace(old2,new2,1)
p.write_text(s)
print('V3_GUARD_PATCH_PASS')
PY
bash "$TMP"
