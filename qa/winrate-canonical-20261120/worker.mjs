const name='ball46-winrate-canonical-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const sources=new Set(['/longterm-performance-343.js','/b46-statistics-fast-v1-20261116.js','/singlepage-workspace-343.js']);
export function canonicalSource(path,src){
 const rules=path==='/longterm-performance-343.js'?[
 ["winCredits+=o==='WIN'?1:o==='HALF_WIN'?.5:0","winCredits+=o==='WIN'||o==='HALF_WIN'?1:0"],
 ["rate=s.ratePoints.at(-1)?.value??null","rate=(s.wins+s.losses)>0?s.wins/(s.wins+s.losses)*100:null"]
 ]:path==='/b46-statistics-fast-v1-20261116.js'?[["(head.win+head.halfWin*.5)/wl*100","(head.win+head.halfWin)/wl*100"]]:[
 ["(c.WIN + c.HALF_WIN * .5) / decided * 100","(c.WIN + c.HALF_WIN) / decided * 100"],
 ["(WIN + 0.5 × HALF_WIN) ÷ (WIN + LOSS + HALF_WIN + HALF_LOSS)","(WIN + HALF_WIN) ÷ (WIN + HALF_WIN + LOSS + HALF_LOSS)"]
 ];
 for(const [a,b] of rules){if(!src.includes(a))throw Error('CANONICAL_SOURCE_DRIFT '+path+' '+a);src=src.replaceAll(a,b)}
 return src+'\n/* B46_CANONICAL_WIN_RATE_TEST_V1 */\n';
}
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_winrate_canonical_health')return Response.json({ok:true,name,scope:'TEST_ONLY_CANONICAL_WINRATE',revision:'CANONICAL_WINRATE_TEST_V1'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method==='GET'&&r.ok&&sources.has(u.pathname)){
  const raw=await r.text();try{const src=canonicalSource(u.pathname,raw);for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');return new Response(src,{status:r.status,headers:h})}catch(e){return new Response(String(e.message),{status:503,headers:{'cache-control':'no-store'}})}
 }
 return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
}};