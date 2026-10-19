#!/usr/bin/env python3
"""Generate isolated candidate CSS from current verified public Member asset. Never upload or deploy."""
import hashlib,os,pathlib,sys
MARK='BALL46_MEMBER_MARKETS_SCROLLBAR_DARK_20261020'
def digest(b):return hashlib.sha256(b).hexdigest()
assert len(sys.argv)==4,'usage: patch_css.py <active-styles.css> <scoped-patch.css> <candidate-output>'
base=pathlib.Path(sys.argv[1]).read_bytes()
addition=pathlib.Path(sys.argv[2]).read_bytes()
assert len(base)>180000,'ACTIVE_CSS_TOO_SMALL_OR_OLD'
assert b'.page-member .member-market-sidebar' in base,'MARKET_SELECTOR_MISSING'
assert b'Graphite' in base or b'#43e6a2' in base.lower(),'THEME_NOT_FOUND'
assert MARK.encode() in addition,'PATCH_SIGNATURE_MISSING'
assert MARK.encode() not in base,'PATCH_ALREADY_PRESENT'
assert addition.count(b'}')==addition.count(b'{'),'UNBALANCED_CSS_BRACES'
assert b'width:' not in addition and b'height:' not in addition,'MUST_NOT_CHANGE_SCROLLBAR_GEOMETRY'
assert b'position:' not in addition and b'overflow:' not in addition,'MUST_NOT_CHANGE_LAYOUT'
assert b'.page-member .member-market-sidebar' in addition,'WRONG_SCOPE'
assert b'scrollbar-color: #334155 #0b1620' in addition,'WRONG_APPROVED_COLORS'
final=base+b'\n'+addition
assert final.startswith(base) and final[len(base)+1:]==addition,'UNEXPECTED_MUTATION'
pathlib.Path(sys.argv[3]).parent.mkdir(parents=True,exist_ok=True)
pathlib.Path(sys.argv[3]).write_bytes(final)
print('CANDIDATE_CSS_PATCHED_ONLY_NO_DEPLOY',dict(base_sha256=digest(base),candidate_sha256=digest(final),size_before=len(base),size_after=len(final)))
