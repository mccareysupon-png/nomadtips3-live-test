const name='ball46-stats-number-format-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);

const finance='/longterm-performance-343.js';
function replaceExact(s,a,b){if(!s.includes(a))throw Error('FORMAT_SOURCE_DRIFT '+a);return s.replaceAll(a,b)}
export function patchFinance(s){
 const fixed=String.raw`function b46DisplayFixed(v,d){const p=v.toFixed(d).split(".");p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");return p.join(".")}`+'\n';
 s=replaceExact(s,'function valueText(v){',fixed+'function valueText(v){');
 s=replaceExact(s,'\x24{v.toFixed(2)}U','\x24{b46DisplayFixed(v,2)}U');
 s=replaceExact(s,'s.wins+\x27 · \x27+s.pushes+\x27 · \x27+s.losses',"[s.wins,s.pushes,s.losses].map(n=>n.toLocaleString('en-US')).join(' · ')");
 s=replaceExact(s,'s.stake.toFixed(0)+\x27U','b46DisplayFixed(s.stake,0)+\x27U');
 s=replaceExact(s,'s.maxDD.toFixed(2)+\x27U','b46DisplayFixed(s.maxDD,2)+\x27U');
 s=replaceExact(s,"s.rows+' settled'","s.rows.toLocaleString('en-US')+' settled'");
 return s;
}

export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_stats_number_health')return Response.json({ok:true,name,scope:'TEST_ONLY_NUMERIC_RENDERING',revision:'FORMAT_V1'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method==='GET'&&r.ok&&u.pathname===finance){for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');try{return new Response(patchFinance(await r.text()),{status:r.status,headers:h})}catch(e){return Response.json({error:e.message},{status:502})}}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
}};