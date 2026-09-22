from pathlib import Path
import re

CSS = Path('nomad-live-343/dashboard-v2.css')
INDEX = Path('nomad-live-343/index.html')

css = CSS.read_text()
old_marker = '/* BALL46_DEFAULT_MARKET_DETAIL_20260922 */'
if old_marker not in css:
    raise SystemExit('OLD_MARKET_DETAIL_MARKER_MISSING')

# The market-detail presentation block is intentionally the final CSS layer.
# Replace it rather than stacking another visual override on top.
head, tail = css.split(old_marker, 1)
if not tail.strip():
    raise SystemExit('OLD_MARKET_DETAIL_BLOCK_EMPTY')

new_block = r'''/* BALL46_DEFAULT_MARKET_CLEANUP_20260922 */
@media(min-width:1181px){
  .match-row{grid-template-columns:minmax(250px,1fr) 62px 142px 146px 146px 92px;gap:6px;}
}
@media(min-width:761px) and (max-width:1180px){
  .match-row{grid-template-columns:minmax(190px,1fr) 58px 116px 122px 122px 82px;gap:5px;}
}
@media(min-width:761px){
  .match-row{min-height:64px;}
  .market-cell{
    position:relative;
    min-width:0;
    min-height:48px;
    padding:5px 11px;
    display:flex;
    flex-direction:column;
    justify-content:center;
    overflow:hidden;
    border:0;
    border-radius:0;
    background:transparent;
    text-align:center;
  }
  .market-cell::before{
    content:'';
    position:absolute;
    left:0;
    top:8px;
    bottom:8px;
    width:1px;
    background:color-mix(in srgb,var(--line) 68%,transparent);
    pointer-events:none;
  }
  .market-cell .market-head{
    display:block;
    max-width:100%;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    color:var(--muted);
    font-size:7.5px;
    font-weight:900;
    letter-spacing:.035em;
    line-height:1.05;
  }
  .market-prices{
    width:100%;
    min-width:0;
    margin-top:4px;
    font-variant-numeric:tabular-nums;
    font-feature-settings:'tnum' 1;
  }
  .market-prices-1x2{
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:8px;
    align-items:center;
  }
  .market-quote{
    display:grid;
    grid-template-rows:auto auto;
    justify-items:center;
    min-width:0;
    line-height:1.05;
  }
  .market-quote i,.market-price-row i{
    font-style:normal;
    color:var(--muted);
    font-size:6.5px;
    font-weight:900;
    line-height:1;
  }
  .market-quote strong{
    display:block;
    max-width:100%;
    margin-top:1px;
    font-size:8.5px;
    font-weight:900;
    line-height:1.05;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:clip;
  }
  .market-prices-ah,.market-prices-ou{
    display:grid;
    gap:3px;
  }
  .market-price-row{
    display:grid;
    grid-template-columns:9px minmax(38px,.9fr) minmax(40px,1fr);
    gap:6px;
    align-items:center;
    min-width:0;
    white-space:nowrap;
    line-height:1.05;
  }
  .market-price-row em{
    min-width:0;
    font-style:normal;
    text-align:center;
    color:var(--text);
    font-size:8.5px;
    font-weight:750;
    overflow:hidden;
    text-overflow:clip;
  }
  .market-price-row strong{
    min-width:0;
    text-align:right;
    font-size:9px;
    font-weight:900;
    overflow:hidden;
    text-overflow:clip;
  }
  .market-prices-empty{
    display:grid;
    place-items:center;
    min-height:18px;
  }
  .market-prices-empty strong{font-size:8px;color:var(--muted);}
  .market-cell small{
    display:block;
    max-width:100%;
    margin-top:3px;
    color:var(--muted);
    font-size:6.5px;
    line-height:1.05;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .signal-cell{
    position:relative;
    min-width:0;
    padding-left:10px;
  }
  .signal-cell::after{
    content:'';
    position:absolute;
    left:0;
    top:8px;
    bottom:8px;
    width:1px;
    background:color-mix(in srgb,var(--line) 68%,transparent);
    pointer-events:none;
  }
}
'''
CSS.write_text(head.rstrip() + '\n\n' + new_block)

html = INDEX.read_text()
html, n = re.subn(r'dashboard-v2\.css(?:\?[^"\']*)?', 'dashboard-v2.css?v=343-market-clean-20260922a', html)
if n < 1:
    raise SystemExit('DASHBOARD_CSS_CACHE_TARGET_MISSING')
INDEX.write_text(html)

print('BALL46_DEFAULT_MARKET_CLEANUP_PATCH_OK')
