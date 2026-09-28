#!/usr/bin/env bash
set -euo pipefail
SRC='.github/scripts/ball46_scorebar_height70_predeploy_20260928.sh'
TMP='/tmp/ball46_scorebar_height70_predeploy_v2.sh'
cp "$SRC" "$TMP"
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/ball46_scorebar_height70_predeploy_v2.sh');s=p.read_text()
old="""def patch_rule(src,selector,changes):
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
new="""def patch_rule(src,selector,changes):
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
if old not in s: raise SystemExit('PATCH_FUNCTION_TEMPLATE_NOT_FOUND')
p.write_text(s.replace(old,new,1))
print('DECLARATION_AWARE_GUARD_PATCH_PASS')
PY
bash "$TMP"
