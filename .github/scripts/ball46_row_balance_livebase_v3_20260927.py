#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, re, json

BASE_INDEX_SHA = "d6385dcc5d9c6123a8a16f6c574287804baca177b004cdca4315b7cb9dc2305a"
BASE_JS_SHA = "2ef44e4c4bd1f0837525444d7b28ab8ab9aa77cf4e03fac33ea69e536b12cb85"
BASE_CSS_SHA = "54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d"
MARKER = "BALL46 LIVE ROW BALANCE LIVEBASE V3 20260927"
CACHE_TAG = "layout=20260927-row-balance-livebase-v3"

OLD_ROW = """function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,'1X2'),mah=marketCompact(f,'AH'),mou=marketCompact(f,'OU'),half=halfScoreLabel(f);return `<article class=\"match-row ${active?'active':''}\" data-match-id=\"${esc(id)}\" tabindex=\"0\" role=\"button\" aria-label=\"${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}\"><div class=\"teams-cell\"><b>${esc(f?.home?.name||'—')}</b><b>${esc(f?.away?.name||'—')}</b></div><div class=\"score-cell\">${scoreStack(f)}<small>${esc(kind==='live'?clockLabel(f):kind==='finished'?'FT':kickoffLabel(f))}</small>${half?`<small class=\"half-score\">${esc(half)}</small>`:''}</div>${marketCell('1X2',m1)}${marketCell('AH',mah)}${marketCell('O/U',mou)}${inlineSignalHtml(sig)}</article>`}"""

NEW_ROW = """function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,'1X2'),mah=marketCompact(f,'AH'),mou=marketCompact(f,'OU'),half=halfScoreLabel(f),status=kind==='live'?clockLabel(f):kind==='finished'?'FT':kickoffLabel(f);return `<article class=\"match-row ${active?'active':''}\" data-match-id=\"${esc(id)}\" tabindex=\"0\" role=\"button\" aria-label=\"${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}\"><div class=\"teams-cell\"><b>${esc(f?.home?.name||'—')}</b><b>${esc(f?.away?.name||'—')}</b></div><div class=\"score-cell\">${scoreStack(f)}<small class=\"row-status-mobile\">${esc(status)}</small>${half?`<small class=\"half-score row-half-mobile\">${esc(half)}</small>`:''}</div><div class=\"match-meta-cell\"><small class=\"match-clock ${kind==='live'?'live':''}\">${esc(status)}</small>${half?`<small class=\"half-score\">${esc(half)}</small>`:''}</div>${marketCell('1X2',m1)}${marketCell('AH',mah)}${marketCell('O/U',mou)}${inlineSignalHtml(sig)}</article>`}"""

CSS_APPEND = r"""

/* BALL46 LIVE ROW BALANCE LIVEBASE V3 20260927
   Presentation only:
   - Home/Away score rows align with Home/Away team-name rows.
   - Clock/FT/kickoff + HT use the unused horizontal middle area on desktop/tablet.
   - SIGNAL receives more width without increasing font size or row height.
   - Mobile keeps the pre-change visible structure; the added meta cell is hidden. */
@media(min-width:901px){
  .match-row{
    grid-template-columns:minmax(210px,1fr) 48px 100px 118px 118px 118px minmax(132px,.45fr);
    gap:8px;
  }
  .teams-cell,.score-cell{
    display:grid;
    grid-template-rows:repeat(2,1.5em);
    align-content:center;
    align-items:center;
    min-width:0;
  }
  .score-cell>small{display:none!important}
  .score-cell strong{align-self:center;justify-self:center;margin:0}
  .match-meta-cell{
    min-width:0;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    white-space:nowrap;
    overflow:hidden;
  }
  .match-meta-cell small{
    margin:0;
    color:var(--muted);
    font-size:8px;
    line-height:1;
    flex:0 0 auto;
  }
  .match-meta-cell .match-clock.live{color:var(--green);font-weight:900}
}
@media(min-width:1180px){
  .match-row{
    grid-template-columns:minmax(260px,1fr) 48px 120px 118px 118px 118px 210px;
  }
}
@media(min-width:761px) and (max-width:900px){
  .match-row{
    grid-template-columns:minmax(180px,1fr) 44px 90px 102px 102px 102px minmax(108px,.4fr);
    gap:4px;
  }
  .teams-cell,.score-cell{
    display:grid;
    grid-template-rows:repeat(2,1.5em);
    align-content:center;
    align-items:center;
    min-width:0;
  }
  .score-cell>small{display:none!important}
  .score-cell strong{align-self:center;justify-self:center;margin:0}
  .match-meta-cell{
    min-width:0;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    white-space:nowrap;
    overflow:hidden;
  }
  .match-meta-cell small{margin:0;color:var(--muted);font-size:8px;line-height:1;flex:0 0 auto}
  .match-meta-cell .match-clock.live{color:var(--green);font-weight:900}
}
@media(max-width:760px){
  .match-meta-cell{display:none!important}
}
"""

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def bump_once(text: str, name: str) -> str:
    pat = re.compile(re.escape(name) + r'(?:\?[^"\x27<> ]*)?')
    matches = list(pat.finditer(text))
    if len(matches) != 1:
        raise SystemExit(f"CACHE_REF_COUNT:{name}:{len(matches)}")
    m = matches[0]
    old = m.group(0)
    new = old + ("&" if "?" in old else "?") + CACHE_TAG
    return text[:m.start()] + new + text[m.end():]

def verify_base(root: Path):
    checks = {
        "index": sha(root/"index.html") == BASE_INDEX_SHA,
        "js": sha(root/"dashboard-v2-stage3.js") == BASE_JS_SHA,
        "css": sha(root/"dashboard-v2-tune.css") == BASE_CSS_SHA,
    }
    print("BASE_KEY_HASHES", checks)
    if not all(checks.values()):
        raise SystemExit("BASE_KEY_HASH_MISMATCH")

def patch(root: Path):
    verify_base(root)
    js = root/"dashboard-v2-stage3.js"
    css = root/"dashboard-v2-tune.css"
    idx = root/"index.html"

    s = js.read_text()
    n = s.count(OLD_ROW)
    if n != 1:
        raise SystemExit(f"ROW_TARGET_COUNT:{n}")
    if "match-meta-cell" in s:
        raise SystemExit("UNEXPECTED_META_CELL_ALREADY_PRESENT")
    js.write_text(s.replace(OLD_ROW, NEW_ROW, 1))

    c = css.read_text()
    if MARKER in c:
        raise SystemExit("CSS_MARKER_ALREADY_PRESENT")
    css.write_text(c + CSS_APPEND)

    h = idx.read_text()
    if CACHE_TAG in h:
        raise SystemExit("CACHE_TAG_ALREADY_PRESENT")
    h = bump_once(h, "dashboard-v2-tune.css")
    h = bump_once(h, "dashboard-v2-stage3.js")
    idx.write_text(h)
    print("PATCH_PASS", {
        "index": sha(idx),
        "js": sha(js),
        "css": sha(css),
    })

def diff_gate(root: Path, base: Path, refs_path: Path):
    refs = [x.strip() for x in refs_path.read_text().splitlines() if x.strip()]
    if len(refs) != 69:
        raise SystemExit(f"REFERENCE_COUNT:{len(refs)}")
    changed = []
    for f in refs:
        rp, bp = root/f, base/f
        if not rp.exists() or not bp.exists():
            raise SystemExit(f"MISSING_FILE:{f}")
        if sha(rp) != sha(bp):
            changed.append(f)
    allowed = {"index.html","dashboard-v2-stage3.js","dashboard-v2-tune.css"}
    print("CHANGED_FILES", changed)
    if set(changed) != allowed or len(changed) != 3:
        raise SystemExit(f"UNSAFE_DIFF:{changed}")

    js = (root/"dashboard-v2-stage3.js").read_text()
    css = (root/"dashboard-v2-tune.css").read_text()
    idx = (root/"index.html").read_text()
    checks = {
        "old_row_removed": OLD_ROW not in js,
        "new_row_once": js.count(NEW_ROW) == 1,
        "meta_cell_once": js.count('class=\"match-meta-cell\"') == 1,
        "mobile_status_once": js.count('row-status-mobile') == 1,
        "mobile_half_once": js.count('row-half-mobile') == 1,
        "css_marker_once": css.count(MARKER) == 1,
        "desktop_7_columns": "grid-template-columns:minmax(210px,1fr) 48px 100px 118px 118px 118px minmax(132px,.45fr);" in css,
        "wide_signal_210": "grid-template-columns:minmax(260px,1fr) 48px 120px 118px 118px 118px 210px;" in css,
        "tablet_7_columns": "grid-template-columns:minmax(180px,1fr) 44px 90px 102px 102px 102px minmax(108px,.4fr);" in css,
        "desktop_score_meta_hidden": css.count(".score-cell>small{display:none!important}") >= 2,
        "mobile_meta_hidden": "@media(max-width:760px){\n  .match-meta-cell{display:none!important}\n}" in css,
        "cache_tag_twice": idx.count(CACHE_TAG) == 2,
    }
    print("SAFETY_CHECKS", json.dumps(checks, sort_keys=True))
    if not all(checks.values()):
        raise SystemExit("TARGET_SAFETY_GATE_FAIL")
    print("EXACT_THREE_FILE_DIFF_GATE_PASS")

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("patch"); p.add_argument("root")
    p = sub.add_parser("gate"); p.add_argument("root"); p.add_argument("base"); p.add_argument("refs")
    p = sub.add_parser("verify-base"); p.add_argument("root")
    a = ap.parse_args()
    if a.cmd == "patch":
        patch(Path(a.root))
    elif a.cmd == "gate":
        diff_gate(Path(a.root), Path(a.base), Path(a.refs))
    else:
        verify_base(Path(a.root))

if __name__ == "__main__":
    main()
