from pathlib import Path
import re

ROOT = Path('nomad-live-343')
JS = ROOT / 'dashboard-v2-stage3.js'
CSS = ROOT / 'dashboard-v2.css'
INDEX = ROOT / 'index.html'


def replace_between(text, start_pattern, end_pattern, replacement, label):
    pat = re.compile(start_pattern + r'.*?(?=' + end_pattern + r')', re.S)
    text2, n = pat.subn(replacement + '\n', text, count=1)
    if n != 1:
        raise SystemExit(f'{label}_REPLACE_COUNT_{n}')
    return text2


market_value = """function marketValue(target,value){
  if(target==='1X2'){
    const h=num(value?.home),d=num(value?.draw),a=num(value?.away);
    if(h===null&&d===null&&a===null)return null;
    return{kind:'1X2',home:h,draw:d,away:a};
  }
  const line=num(value?.line??value?.hdp??value?.handicap??value?.total);
  if(target==='AH'){
    const h=num(value?.home??value?.home_odds??value?.homeOdds),a=num(value?.away??value?.away_odds??value?.awayOdds);
    if(line===null&&h===null&&a===null)return null;
    return{kind:'AH',line,home:h,away:a};
  }
  const o=num(value?.over??value?.over_odds??value?.overOdds),u=num(value?.under??value?.under_odds??value?.underOdds);
  if(line===null&&o===null&&u===null)return null;
  return{kind:'OU',line,over:o,under:u};
}"""

market_compact = """function marketCompact(f,target){
  const kind=classify(f);
  for(const book of providerBooks(f)){
    const market=exactMarket(book.odds,target),stage=stagePick(market,kind);
    if(!stage)continue;
    const detail=marketValue(target,stage[1]);
    if(detail)return{stage:stage[0],detail,book:book.name};
  }
  return{stage:'',detail:null,book:''};
}"""

market_cell = """function marketCell(label,data){
  const title=[data.book,data.stage].filter(Boolean).join(' · '),d=data?.detail||null;
  const price=v=>num(v)===null?'—':num(v).toFixed(2);
  const signed=v=>{const n=num(v);if(n===null)return'—';const z=Math.abs(n)<1e-9?0:n;return`${z>0?'+':''}${show(z,2)}`};
  const plainLine=v=>num(v)===null?'—':show(num(v),2);
  let body='<div class="market-prices market-prices-empty"><strong>—</strong></div>';
  if(d?.kind==='1X2'){
    body=`<div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>${esc(price(d.home))}</strong></div><div class="market-quote"><i>D</i><strong>${esc(price(d.draw))}</strong></div><div class="market-quote"><i>A</i><strong>${esc(price(d.away))}</strong></div></div>`;
  }else if(d?.kind==='AH'){
    const hl=signed(d.line),al=num(d.line)===null?'—':signed(-num(d.line));
    body=`<div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>${esc(hl)}</em><strong>${esc(price(d.home))}</strong></div><div class="market-price-row"><i>A</i><em>${esc(al)}</em><strong>${esc(price(d.away))}</strong></div></div>`;
  }else if(d?.kind==='OU'){
    const line=plainLine(d.line);
    body=`<div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>${esc(line)}</em><strong>${esc(price(d.over))}</strong></div><div class="market-price-row"><i>U</i><em>${esc(line)}</em><strong>${esc(price(d.under))}</strong></div></div>`;
  }
  const kindClass=d?.kind?String(d.kind).toLowerCase().replace(/[^a-z0-9]+/g,'-'):'empty';
  return `<div class="market-cell market-cell-${kindClass}"${title?` title="${esc(title)}"`:''}><span class="market-head">${esc(label)}${data.stage?` · ${esc(data.stage)}`:''}</span>${body}${data.book?`<small>${esc(data.book)}</small>`:''}</div>`;
}"""

s = JS.read_text()
s = replace_between(s, r'function marketValue\(target,value\)\{', r'function marketCompact\(f,target\)\{', market_value, 'MARKET_VALUE')
s = replace_between(s, r'function marketCompact\(f,target\)\{', r'function metricRows\(f\)\{', market_compact, 'MARKET_COMPACT')
s = replace_between(s, r'function marketCell\(label,data\)\{', r'function inlineSignalHtml\(s\)\{', market_cell, 'MARKET_CELL')
JS.write_text(s)

marker = '/* BALL46_DEFAULT_MARKET_DETAIL_20260922 */'
c = CSS.read_text()
if marker in c:
    raise SystemExit('MARKET_DETAIL_MARKER_ALREADY_PRESENT')
c += r'''

/* BALL46_DEFAULT_MARKET_DETAIL_20260922 */
@media(min-width:761px){
  .match-row{min-height:66px}
  .market-cell{min-width:0;min-height:50px;padding:4px 3px;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
  .market-cell .market-head{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:7px;line-height:1.05}
  .market-prices{width:100%;min-width:0;margin-top:3px;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
  .market-prices-1x2{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px}
  .market-quote{display:grid;grid-template-rows:auto auto;justify-items:center;min-width:0;line-height:1.05}
  .market-quote i,.market-price-row i{font-style:normal;color:var(--muted);font-size:6.5px;font-weight:900;line-height:1}
  .market-quote strong{display:block;max-width:100%;font-size:7.5px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:clip}
  .market-prices-ah,.market-prices-ou{display:grid;gap:2px}
  .market-price-row{display:grid;grid-template-columns:8px minmax(0,1fr) minmax(0,1fr);gap:2px;align-items:center;min-width:0;white-space:nowrap;line-height:1.05}
  .market-price-row em{min-width:0;font-style:normal;text-align:center;color:var(--text);font-size:7.5px;font-weight:800;overflow:hidden;text-overflow:clip}
  .market-price-row strong{min-width:0;text-align:right;font-size:7.5px;font-weight:900;overflow:hidden;text-overflow:clip}
  .market-prices-empty{display:grid;place-items:center;min-height:18px}
  .market-prices-empty strong{font-size:8px;color:var(--muted)}
  .market-cell small{display:block;max-width:100%;margin-top:2px;color:var(--muted);font-size:6px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
}
'''
CSS.write_text(c)

h = INDEX.read_text()
for name, ver in {
    'dashboard-v2-stage3.js': '343-market-detail-20260922a',
    'dashboard-v2.css': '343-market-detail-20260922a',
}.items():
    h, n = re.subn(re.escape(name) + r'(?:\?[^"\']*)?', f'{name}?v={ver}', h)
    if n < 1:
        raise SystemExit(f'CACHE_BUST_TARGET_MISSING:{name}')
INDEX.write_text(h)

print('BALL46_DEFAULT_MARKET_DETAIL_PATCH_OK')
