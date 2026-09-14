from pathlib import Path
import re

p=Path('nomad-live-343/full-odds-bulk-343.js')
s=p.read_text()
start=s.find('function marketHtml(key,bookMarkets,card){')
end=s.find('\nfunction ensureStyle()',start)
if start<0 or end<0:
    raise SystemExit('marketHtml boundaries missing')

new = r'''function emptyStageRow(kind,label){const live=label==='LIVE',rowClass=`fom-price-row${live?' live':''}`,stage=`<span class="fom-stage-label${live?' live':''}">${live?'<i></i> LIVE':label}</span>`,blank='<strong class="fom-price fom-price-empty"></strong>',cols=kind==='1X2'?'cols-1x2':kind==='AH'?'cols-ah':'cols-total';return `<div class="${rowClass} ${cols} fom-no-data">${stage}${blank}${blank}${kind==='1X2'?blank:''}</div>`}
function marketHtml(key,bookMarkets,card){const kind=marketKind(key),home=team(card,'home'),away=team(card,'away'),stageLabels=[];for(const market of bookMarkets.values()){for(const [label,value] of stages(market)){if(stageRow(kind,label,value)&&!stageLabels.includes(label))stageLabels.push(label)}}const order={OPEN:0,CLOSE:1,LIVE:2};stageLabels.sort((a,b)=>(order[a]??9)-(order[b]??9));if(!stageLabels.length)return'';const bookRows=[];for(const book of BOOKS){const market=bookMarkets.get(book.slug),byStage=new Map(market?stages(market):[]),rows=stageLabels.map(label=>{const value=byStage.get(label);return(value&&stageRow(kind,label,value))||emptyStageRow(kind,label)});bookRows.push(`<section class="fom-book" data-book="${esc(book.slug)}" data-has-market="${market?'1':'0'}"><header><b>${esc(book.name)}</b><small>${esc(book.role)}</small></header>${rows.join('')}</section>`)}const title=LABELS[key]||String(key).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());return `<section class="fom-market"><header class="fom-market-head"><div><b>${esc(title)}</b><small>${kind==='AH'?'Signed handicap shown on each team side':kind==='1X2'?'Home · Draw · Away':'Line + decimal price'}</small></div><span>${BOOKS.length} BOOKS</span></header>${columnHead(kind,home,away)}<div class="fom-books">${bookRows.join('')}</div></section>`}'''
s=s[:start]+new+s[end:]
s=s.replace("const VERSION='343-full-odds-bulk-v1-zero-click-requests';","const VERSION='343-full-odds-bulk-v2-fixed-10book-roster';",1)
if '.fom-price-empty{' not in s:
    s=s.replace('.fom-price{text-align:center;font-size:9px;font-variant-numeric:tabular-nums}', '.fom-price{text-align:center;font-size:9px;font-variant-numeric:tabular-nums}.fom-price-empty{min-height:1em}.fom-no-data .fom-stage-label{opacity:.72}',1)
p.write_text(s)

h=Path('nomad-live-343/index.html')
x=h.read_text()
x=re.sub(r'full-odds-bulk-343\.js\?v=[^"\']+','full-odds-bulk-343.js?v=343-fixed-10book-roster-v1',x)
h.write_text(x)
