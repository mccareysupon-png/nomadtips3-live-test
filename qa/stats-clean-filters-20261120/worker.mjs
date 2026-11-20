const name='ball46-stats-clean-filters-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);
export const css='<style id="b46-stats-clean-filters-20261120">html:root body .sp-stats-content.sp-stats-content > section.sp-filters.sp-filters{display:none!important}html:root body .sp-stats-content > #b46-finance-chart-card#b46-finance-chart-card{margin-bottom:12px!important}html:root body .sp-stats-content > section.sp-results.sp-results{margin-top:0!important}html:root body .sp-stats-content > #b46-finance-chart-card#b46-finance-chart-card:has(.f46-card){min-height:0!important;height:auto!important}html:root body .sp-stats-content > #b46-finance-chart-card#b46-finance-chart-card > .b46-perf-shell:has(.f46-card){min-height:0!important;height:auto!important}html:root body:has(.left-rail [data-stat-market].active:not([data-stat-market="all"])) .sp-stats-content > #b46-finance-chart-card#b46-finance-chart-card{margin-bottom:24px!important}</style>';
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_stats_clean_health')return Response.json({ok:true,name,scope:'TEST_ONLY_CSS_FILTER_CARDS',gap:12,marketGap:24,revision:'MARKET_SEPARATE_GAP_V3'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};