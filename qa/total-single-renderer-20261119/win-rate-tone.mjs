import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ANCHOR_DRIFT '+a.slice(0,120));return s.replace(a,b)};
export function rateTone(v){const m=String(v).trim().match(/^(\d+(?:\.\d+)?)%$/);if(!m)return 'neutral';const n=Number(m[1]);return n>50?'green':n===50?'yellow':'red'}
const helper=rateTone.toString().replace('function rateTone','function b46RateTone');
export function patchRate({finance,visual,fast}){
 assert.equal(sha(finance),'ff4db092714a8b7a51d89115b038ac1826dcf6ea95510abd4f99ceec350b5a52','FINANCE_DRIFT');
 assert.equal(sha(visual),'3b301bb097294a21fd92222007d6222f4313ed4fb9b257d81a5b8a04d98128a9','VISUAL_DRIFT');
 assert.equal(sha(fast),'51d9cd5daa173d73c2479bb11a853d92e727c57b84bb16401382773292ecab0e','FAST_DRIFT');
 finance=once(finance,'function b46TotalMarkup(s,rate){',helper+'\nfunction b46TotalMarkup(s,rate){');
 finance=once(finance,"['WIN RATE','rate',kpiText(rate,'pct'),'green']","['WIN RATE','rate',kpiText(rate,'pct'),b46RateTone(kpiText(rate,'pct'))]");
 finance=once(finance,".map(v=>'<div><span>'+v[0]+'</span><b>'+v[1]+'</b></div>')",".map(v=>'<div><span>'+v[0]+'</span><b'+(v[0]==='WIN RATE'?' data-b46-rate-tone=\"'+b46RateTone(v[1])+'\"':'')+'>'+v[1]+'</b></div>')");
 finance=once(finance,"<strong class=\"b46-stage-summary-number\">'+(k==='wpl'?","<strong class=\"b46-stage-summary-number\"'+(k==='rate'?' data-b46-rate-tone=\"'+b46RateTone(v)+'\"':'')+'>'+(k==='wpl'?");
 visual=once(visual,'  function sync(){',helper+'\n  function sync(){');
 visual=once(visual,'item.dataset.tone=entry.tone;',"item.dataset.tone=entry.key==='rate'?b46RateTone(entry.value):entry.tone;");
 visual=once(visual,"value.className='b46-stage-summary-number';","value.className='b46-stage-summary-number';if(entry.key==='rate')value.dataset.b46RateTone=b46RateTone(entry.value);");
 fast=once(fast,'function enhanceFilteredMarket(){',helper+'\nfunction enhanceFilteredMarket(){');
 assert.equal(fast.split("else strong.textContent=value;").length,3);
 fast=fast.replaceAll("else strong.textContent=value;","else strong.textContent=value;if(key==='rate')strong.dataset.b46RateTone=b46RateTone(value);");
 return {finance,visual,fast};
}
export function patchNativeHtml(html){return once(html,"if(['WIN','WIN RATE'].includes(label))tone='green';","if(label==='WIN')tone='green';else if(label==='WIN RATE'){const n=/^\\d+(?:\\.\\d+)?%$/.test(value)?parseFloat(value):NaN;tone=Number.isFinite(n)?n>50?'green':n===50?'yellow':'red':'white';}")}
export const rateCSS=String.raw`
/* WIN RATE only: compare the actual displayed percentage. Same semantic palette as W D L. */
html[data-theme] body[data-workspace-view="statistics"] #b46-finance-chart-card[data-f46-visual] .f46-overview [data-b46-rate-tone="green"],
html[data-theme] body[data-workspace-view="statistics"] #b46-fast-v1-preview [data-b46-rate-tone="green"]{color:var(--b46-wdl-win)!important}
html[data-theme] body[data-workspace-view="statistics"] #b46-finance-chart-card[data-f46-visual] .f46-overview [data-b46-rate-tone="yellow"],
html[data-theme] body[data-workspace-view="statistics"] #b46-fast-v1-preview [data-b46-rate-tone="yellow"]{color:var(--b46-wdl-draw)!important}
html[data-theme] body[data-workspace-view="statistics"] #b46-finance-chart-card[data-f46-visual] .f46-overview [data-b46-rate-tone="red"],
html[data-theme] body[data-workspace-view="statistics"] #b46-fast-v1-preview [data-b46-rate-tone="red"]{color:var(--b46-wdl-loss)!important}
html[data-theme] body[data-workspace-view="statistics"] #b46-finance-chart-card[data-f46-visual] .f46-overview [data-b46-rate-tone="neutral"],
html[data-theme] body[data-workspace-view="statistics"] #b46-fast-v1-preview [data-b46-rate-tone="neutral"]{color:var(--f46-muted,#91aea0)!important}
`;
