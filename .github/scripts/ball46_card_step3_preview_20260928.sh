#!/usr/bin/env bash
set -euo pipefail

SRC=/tmp/b46-step3-source
OUT=/tmp/b46-step3-output
BASE="$SRC/after"
PROTO="$OUT/prototype"
BEFORE="$OUT/before"
BASE_CSS_SHA=54ca6c53ad6f6f7836e61efd8180030c74ea2827a42c180153c0fc15005e431d
rm -rf "$OUT"
mkdir -p "$OUT"

test -s "$BASE/dashboard-v2-tune.css"
test "$(sha256sum "$BASE/dashboard-v2-tune.css" | awk '{print $1}')" = "$BASE_CSS_SHA"
cp -a "$BASE" "$BEFORE"
cp -a "$BASE" "$PROTO"

cat >> "$PROTO/dashboard-v2-tune.css" <<'CSS'

/* BALL46 CARD REBUILD STEP3 PROTOTYPE 20260928
   CSS-only desktop prototype. Preserve the current row DOM contract and all data wiring. */
@media (min-width:901px){
  .match-row .score-cell{
    min-width:0;
    display:grid;
    grid-template-columns:30px minmax(0,1fr);
    grid-template-rows:repeat(2,minmax(0,1fr));
    column-gap:7px;
    align-items:center;
    text-align:center;
  }
  .match-row .score-cell>strong:nth-of-type(1){grid-column:1;grid-row:1}
  .match-row .score-cell>strong:nth-of-type(2){grid-column:1;grid-row:2}
  .match-row .score-cell>small:not(.half-score){
    grid-column:2;grid-row:1;align-self:end;margin:0 0 2px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-size:8px;line-height:1.05;
  }
  .match-row .score-cell>.half-score{
    grid-column:2;grid-row:2;align-self:start;margin:2px 0 0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font-size:7px;line-height:1.05;
  }
  .match-row .signal-cell.prediction-live{
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
    min-width:0;padding-left:12px;
  }
  .match-row .signal-cell.prediction-live .pred-main{
    display:block;width:100%;white-space:normal;overflow:visible;text-overflow:clip;
    overflow-wrap:anywhere;text-align:center;font-size:8px;line-height:1.18;
  }
  .match-row .signal-cell.prediction-live .pred-sub{
    display:block;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    text-align:center;font-size:7px;line-height:1.05;
  }
}
@media (min-width:1181px){
  .match-row{grid-template-columns:minmax(0,1fr) 92px 118px 118px 118px 128px;gap:6px}
}
@media (min-width:901px) and (max-width:1180px){
  .match-row{grid-template-columns:minmax(0,1fr) 78px 118px 118px 118px 96px;gap:5px}
  .match-row .score-cell{grid-template-columns:27px minmax(0,1fr);column-gap:5px}
}
CSS

python3 - <<'PY'
from pathlib import Path
import hashlib
base=Path('/tmp/b46-step3-source/after'); proto=Path('/tmp/b46-step3-output/prototype')
changed=[]
for p in sorted(base.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(base)
    q=proto/rel
    if not q.exists() or hashlib.sha256(p.read_bytes()).digest()!=hashlib.sha256(q.read_bytes()).digest(): changed.append(rel.as_posix())
print('CHANGED_ASSETS=',changed)
if changed!=['dashboard-v2-tune.css']: raise SystemExit('STEP3_DIFF_GATE_FAILED:'+repr(changed))
Path('/tmp/b46-step3-output/changed-assets.txt').write_text('\n'.join(changed)+'\n')
PY

echo STEP3_ONE_FILE_DIFF_PASS

cat > "$OUT/preview.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="dashboard-v2.css"><link rel="stylesheet" href="dashboard-v2-tune.css"><link rel="stylesheet" href="color-semantics-343.css"><link rel="stylesheet" href="team-sides-343.css">
<style>body{padding:20px}.preview{max-width:840px;margin:0 auto}.preview-note{font:12px Arial;margin:0 0 12px;color:#728078}.board-sections{height:auto!important;overflow:visible!important;padding:0!important}</style></head>
<body data-workspace-view="live"><main class="preview"><p class="preview-note">Ball46 Step 3 — production DOM contract preview</p><div class="board-sections" data-board-sections><section class="status-section"><header class="status-head"><div><i class="status-dot live"></i><h2>LIVE</h2></div><b>4</b></header><section class="league-block"><header class="league-head"><strong>Premier League</strong><span>4 matches</span></header>
<article class="match-row" data-match-id="1"><div class="teams-cell"><b>Manchester City</b><b>Manchester United</b></div><div class="score-cell"><strong>2</strong><strong>1</strong><small>67'</small><small class="half-score">HT 1-1</small></div><div class="market-cell"><span class="market-head">1X2</span><div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>1.82</strong></div><div class="market-quote"><i>D</i><strong>3.45</strong></div><div class="market-quote"><i>A</i><strong>4.20</strong></div></div><small>Bet365</small></div><div class="market-cell"><span class="market-head">AH</span><div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>-0.75</em><strong>1.93</strong></div><div class="market-price-row"><i>A</i><em>+0.75</em><strong>1.89</strong></div></div><small>Pinnacle</small></div><div class="market-cell"><span class="market-head">O/U</span><div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>3.25</em><strong>1.95</strong></div><div class="market-price-row"><i>U</i><em>3.25</em><strong>1.87</strong></div></div><small>Bet365</small></div><div class="signal-cell locked prediction-live"><span class="pred-main">AH · HOME -0.75</span><span class="pred-sub">@ 1.93</span></div></article>
<article class="match-row" data-match-id="2"><div class="teams-cell"><b>Club Atlético River Plate Montevideo</b><b>Defensor Sporting Club</b></div><div class="score-cell"><strong>0</strong><strong>0</strong><small>HT</small><small class="half-score">HT 0-0</small></div><div class="market-cell"><span class="market-head">1X2</span><div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>2.10</strong></div><div class="market-quote"><i>D</i><strong>2.95</strong></div><div class="market-quote"><i>A</i><strong>3.60</strong></div></div></div><div class="market-cell"><span class="market-head">AH</span><div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>-0.25</em><strong>1.88</strong></div><div class="market-price-row"><i>A</i><em>+0.25</em><strong>1.96</strong></div></div></div><div class="market-cell"><span class="market-head">O/U</span><div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>2.25</em><strong>2.02</strong></div><div class="market-price-row"><i>U</i><em>2.25</em><strong>1.82</strong></div></div></div><div class="signal-cell locked prediction-live"><span class="pred-main">OVER · OVER 2.25</span><span class="pred-sub">@ 2.02</span></div></article>
<article class="match-row" data-match-id="3"><div class="teams-cell"><b>Bangkok United</b><b>Buriram United</b></div><div class="score-cell"><strong>1</strong><strong>1</strong><small>84'</small><small class="half-score">HT 0-1</small></div><div class="market-cell"><span class="market-head">1X2</span><div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>3.10</strong></div><div class="market-quote"><i>D</i><strong>2.80</strong></div><div class="market-quote"><i>A</i><strong>2.45</strong></div></div></div><div class="market-cell"><span class="market-head">AH</span><div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>+0.25</em><strong>1.90</strong></div><div class="market-price-row"><i>A</i><em>-0.25</em><strong>1.94</strong></div></div></div><div class="market-cell"><span class="market-head">O/U</span><div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>2.50</em><strong>1.91</strong></div><div class="market-price-row"><i>U</i><em>2.50</em><strong>1.91</strong></div></div></div><div class="signal-cell prediction-live no-pick"><span class="pred-main">WATCH</span><span class="pred-sub">NO LIVE PICK</span></div></article>
<article class="match-row" data-match-id="4"><div class="teams-cell"><b>Real Madrid</b><b>FC Barcelona</b></div><div class="score-cell"><strong>—</strong><strong>—</strong><small>21:00</small></div><div class="market-cell"><span class="market-head">1X2</span><div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>2.05</strong></div><div class="market-quote"><i>D</i><strong>3.70</strong></div><div class="market-quote"><i>A</i><strong>3.20</strong></div></div></div><div class="market-cell"><span class="market-head">AH</span><div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>-0.25</em><strong>1.97</strong></div><div class="market-price-row"><i>A</i><em>+0.25</em><strong>1.87</strong></div></div></div><div class="market-cell"><span class="market-head">O/U</span><div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>3.00</em><strong>1.92</strong></div><div class="market-price-row"><i>U</i><em>3.00</em><strong>1.90</strong></div></div></div><div class="signal-cell prediction-live no-pick"><span class="pred-main">WATCH</span><span class="pred-sub">NO LIVE PICK</span></div></article>
</section></section></div></main>
<script>
addEventListener('load',()=>{
 const rows=()=>[...document.querySelectorAll('.match-row')];
 const widths=()=>rows().map(r=>[...r.children].map(x=>Math.round(x.getBoundingClientRect().width*100)/100));
 const initial=JSON.stringify(widths());
 const host=document.querySelector('.league-block'); const templates=rows().map(x=>x.outerHTML);
 for(let i=0;i<20;i++){const current=[...host.querySelectorAll('.match-row')];current.forEach((el,j)=>el.outerHTML=templates[(j+i)%templates.length]);}
 const stable=initial===JSON.stringify(widths());
 const overflow=rows().some(r=>r.scrollWidth>r.clientWidth+1);
 const first=rows()[0], sig=first.querySelector('.signal-cell'), score=first.querySelector('.score-cell'), team=first.querySelector('.teams-cell');
 document.documentElement.dataset.rerenderStable=String(stable);
 document.documentElement.dataset.rowOverflow=String(overflow);
 document.documentElement.dataset.signalWidth=String(Math.round(sig.getBoundingClientRect().width));
 document.documentElement.dataset.scoreWidth=String(Math.round(score.getBoundingClientRect().width));
 document.documentElement.dataset.teamWidth=String(Math.round(team.getBoundingClientRect().width));
 document.documentElement.dataset.clockInsideScore=String(score.contains(score.querySelector('small:not(.half-score)')));
});
</script></body></html>
HTML
cp "$OUT/preview.html" "$BEFORE/preview.html"
cp "$OUT/preview.html" "$PROTO/preview.html"

chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
python3 -m http.server 8765 --directory "$OUT" >"$OUT/http.log" 2>&1 &
HPID=$!
trap 'kill $HPID 2>/dev/null || true' EXIT
sleep 1

capture(){
  local folder=$1 width=$2 height=$3 name=$4
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size="$width,$height" --virtual-time-budget=2000 --dump-dom "http://127.0.0.1:8765/$folder/preview.html" > "$OUT/$name.dom.html"
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size="$width,$height" --virtual-time-budget=2000 --screenshot="$OUT/$name.png" "http://127.0.0.1:8765/$folder/preview.html" >/dev/null 2>&1
  test -s "$OUT/$name.png"
  grep -q 'data-rerender-stable="true"' "$OUT/$name.dom.html"
  grep -q 'data-row-overflow="false"' "$OUT/$name.dom.html"
  grep -q 'data-clock-inside-score="true"' "$OUT/$name.dom.html"
}

capture before 1440 900 desktop-before
capture prototype 1440 900 desktop-prototype
capture before 1024 900 laptop-before
capture prototype 1024 900 laptop-prototype
capture before 390 844 mobile-before
capture prototype 390 844 mobile-prototype

python3 - <<'PY'
from pathlib import Path
import re
from PIL import Image, ImageChops
root=Path('/tmp/b46-step3-output')
def attrs(name):
    s=(root/f'{name}.dom.html').read_text(errors='ignore')
    out={}
    for k in ['signal-width','score-width','team-width']:
        m=re.search(rf'data-{k}="([0-9]+)"',s)
        if not m: raise SystemExit(f'MISSING_ATTR:{name}:{k}')
        out[k]=int(m.group(1))
    return out
db=attrs('desktop-before'); dp=attrs('desktop-prototype'); lb=attrs('laptop-before'); lp=attrs('laptop-prototype')
print('DESKTOP_BEFORE',db);print('DESKTOP_PROTO',dp);print('LAPTOP_BEFORE',lb);print('LAPTOP_PROTO',lp)
if dp['signal-width'] <= db['signal-width']: raise SystemExit('DESKTOP_SIGNAL_NOT_WIDER')
if lp['signal-width'] <= lb['signal-width']: raise SystemExit('LAPTOP_SIGNAL_NOT_WIDER')
if dp['score-width'] <= db['score-width']: raise SystemExit('DESKTOP_SCORE_META_SPACE_NOT_WIDER')
if lp['score-width'] <= lb['score-width']: raise SystemExit('LAPTOP_SCORE_META_SPACE_NOT_WIDER')
a=Image.open(root/'mobile-before.png').convert('RGBA');b=Image.open(root/'mobile-prototype.png').convert('RGBA')
if a.size!=b.size: raise SystemExit('MOBILE_SIZE_CHANGED')
d=ImageChops.difference(a,b)
if d.getbbox() is not None: raise SystemExit('MOBILE_PIXELS_CHANGED')
print('MOBILE_PIXEL_IDENTICAL',a.size)
PY

kill "$HPID" 2>/dev/null || true
trap - EXIT

echo BALL46_CARD_STEP3_PREVIEW_VERIFIED
