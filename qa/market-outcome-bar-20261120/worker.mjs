const name='ball46-market-outcome-bar-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);

const finance='/longterm-performance-343.js',fast='/b46-statistics-fast-v1-20261116.js';
function exact(s,a,b){if(!s.includes(a))throw Error('OUTCOME_SOURCE_DRIFT '+a);return s.replaceAll(a,b)}
export function patchMarket(s,path){
 if(path===finance){
  const start=s.indexOf('function b46TotalMarkup(s,rate){');
  const a=s.indexOf(" return '<section class=\"b46-stage-outcomes\"",start);
  const end=s.indexOf("</section><div class=\"b46-stage-summary-grid\"",a);
  if(start<0||a<0||end<0)throw Error('TOTAL_MARKUP_DRIFT');
  const section=s.slice(a,end).replaceAll('b46-stage-outcomes','b46-market-unified-outcomes').replace('<span>All time</span>',"<span>'+esc(range==='all'?'All time':'Last '+RANGE_DAYS[range]+' days')+'</span>");
  const helper="function b46MarketOutcomeMarkup(s){const outcomes=[['win','Win',s.wins],['push','DRAW',s.pushes],['loss','Loss',s.losses]];const pct=n=>s.rows?(100*n/s.rows).toFixed(1)+'%':'—';\n"+section+"</section>';}\n";
  s=exact(s,'function b46TotalMarkup(s,rate){',helper+'function b46TotalMarkup(s,rate){');
  s=exact(s,"(totalOwned?b46TotalMarkup(s,rate):'')","(totalOwned?b46TotalMarkup(s,rate):'')+(!totalOwned||!window.matchMedia('(min-width:851px)').matches?b46MarketOutcomeMarkup(s):'')");
 }else if(path===fast){
  const a=s.indexOf(" const section=document.createElement('section');section.className='b46-v1-market-outcomes';");
  const b=s.indexOf(" const details=document.createElement('div');details.className='b46-v1-market-detail-grid';",a);
  if(a<0||b<0)throw Error('OLD_BAR_DRIFT');
  s=s.slice(0,a)+s.slice(b);
  s=exact(s,"overview.querySelector('.b46-v1-market-outcomes')&&","overview.querySelector('.b46-market-unified-outcomes')&&");
  s=exact(s,' overview.insertBefore(section,nativeMetrics);\n','');
 }
 return s;
}
export const css='<style id="b46-market-outcome-bar-20261120">@layer b46MarketOutcomeBar{#b46-finance-chart-card .b46-market-unified-outcomes{box-sizing:border-box;flex:0 0 auto!important;width:auto!important;max-width:100%!important;min-width:0;grid-column:1/-1;align-self:stretch!important;margin:0;padding:12px;border:1px solid rgba(8,124,80,.16);border-radius:12px;background:rgba(8,124,80,.025);color:var(--f46-ink)}#b46-finance-chart-card .b46-market-unified-outcomes-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;color:var(--f46-muted);font-size:10px;line-height:1.2}#b46-finance-chart-card .b46-market-unified-outcomes-heading strong{font-weight:750;letter-spacing:.5px}#b46-finance-chart-card .b46-market-unified-outcomes-track{display:flex;box-sizing:border-box;height:12px;padding:2px;gap:2px;overflow:hidden;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important}#b46-finance-chart-card .b46-market-unified-outcomes-segment{display:block;flex-basis:0;min-width:0;border-radius:2px;border:0!important;box-shadow:none!important;outline:none!important}#b46-finance-chart-card .b46-market-unified-outcomes-segment[data-count="0"]{display:none!important}#b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="win"],#b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="win"] i{background:#087c50}#b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="push"],#b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="push"] i{background:#87570a}#b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="loss"],#b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="loss"] i{background:#c73649}html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="win"],html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="win"] i{background:#37d49a}html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="push"],html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="push"] i{background:#e6bc71}html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-segment[data-result="loss"],html[data-theme="dark"] #b46-finance-chart-card .b46-market-unified-outcomes-legend-item[data-result="loss"] i{background:#ff6779}#b46-finance-chart-card .b46-market-unified-outcomes-legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px}#b46-finance-chart-card .b46-market-unified-outcomes-legend-item{display:flex;align-items:center;gap:3px;min-width:0;font-size:10px;color:var(--f46-muted)}#b46-finance-chart-card .b46-market-unified-outcomes-legend-dot{width:7px;height:7px;border-radius:50%;flex:none}#b46-finance-chart-card .b46-market-unified-outcomes-legend-item b{margin-left:auto;color:var(--f46-ink);font-weight:700;white-space:nowrap}#b46-finance-chart-card .f46-overview:has(>.b46-market-unified-outcomes){flex-wrap:nowrap!important;min-width:0!important}#b46-finance-chart-card .f46-overview:has(>.b46-market-unified-outcomes)>.b46-v1-market-detail-grid{width:auto!important;flex-basis:auto!important;min-width:0!important}@media(max-width:850px){#b46-finance-chart-card .b46-market-unified-outcomes{margin-top:12px;margin-bottom:12px;padding:10px 8px}#b46-finance-chart-card .b46-market-unified-outcomes-legend-item{font-size:9px}}}</style>';

export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_market_outcome_health')return Response.json({ok:true,name,scope:'TEST_ONLY_MARKET_OUTCOME_BAR',revision:'MARKET_OUTCOME_V2'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method==='GET'&&r.ok&&[finance,fast].includes(u.pathname)){for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');try{return new Response(patchMarket(await r.text(),u.pathname),{status:r.status,headers:h})}catch(e){return Response.json({error:e.message},{status:502})}}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};