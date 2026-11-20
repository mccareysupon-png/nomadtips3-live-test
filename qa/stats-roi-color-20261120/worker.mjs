const name='ball46-stats-roi-color-test-20261120';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph','/b46-sidebar-monitor-client-20261119.js']);

const finance='/longterm-performance-343.js',card='/b46-statistics-card-20261116.js',fast='/b46-statistics-fast-v1-20261116.js';
const roiHelper="function b46RoiTone(v){const t=String(v).trim();if(!/^[-+]?\\d+(?:\\.\\d+)?%$/.test(t))return 'neutral';const n=Number(t.slice(0,-1));return n>0?'green':n<0?'red':'yellow'}\n";
function exact(s,a,b){if(!s.includes(a))throw Error('ROI_SOURCE_DRIFT '+a);return s.replaceAll(a,b)}
export function patchRoi(s,path){
 s=exact(s,'function b46RateTone(v){',roiHelper+'function b46RateTone(v){');
 if(path===finance){
  s=exact(s,"s.roi>0?'green':s.roi<0?'red':'white'","b46RoiTone(kpiText(s.roi,'pct'))");
  s=exact(s,"(k==='rate'?' data-b46-rate-tone=\"'+b46RateTone(v)+'\"':'')","(k==='rate'?' data-b46-rate-tone=\"'+b46RateTone(v)+'\"':k==='roi'?' data-b46-roi-tone=\"'+b46RoiTone(v)+'\"':'')");
  s=exact(s,"(v[0]==='WIN RATE'?' data-b46-rate-tone=\"'+b46RateTone(v[1])+'\"':'')","(v[0]==='WIN RATE'?' data-b46-rate-tone=\"'+b46RateTone(v[1])+'\"':v[0]==='ROI'?' data-b46-roi-tone=\"'+b46RoiTone(v[1])+'\"':'')");
 }else if(path===card){
  s=exact(s,"if(entry.key==='rate')value.dataset.b46RateTone=b46RateTone(entry.value);","if(entry.key==='rate')value.dataset.b46RateTone=b46RateTone(entry.value);if(entry.key==='roi')value.dataset.b46RoiTone=b46RoiTone(entry.value);");
 }else if(path===fast){
  s=exact(s,"if(key==='rate')strong.dataset.b46RateTone=b46RateTone(value);","if(key==='rate')strong.dataset.b46RateTone=b46RateTone(value);if(key==='roi')strong.dataset.b46RoiTone=b46RoiTone(value);");
 }
 return s;
}
export const css='<style id="b46-stats-roi-color-20261120">html:root body [data-b46-roi-tone="green"][data-b46-roi-tone]{color:#087c50!important}html:root body [data-b46-roi-tone="red"][data-b46-roi-tone]{color:#b42336!important}html:root body [data-b46-roi-tone="yellow"][data-b46-roi-tone]{color:#946200!important}html:root[data-theme="dark"] body [data-b46-roi-tone="green"][data-b46-roi-tone]{color:#55d6a1!important}html:root[data-theme="dark"] body [data-b46-roi-tone="red"][data-b46-roi-tone]{color:#ff727e!important}html:root[data-theme="dark"] body [data-b46-roi-tone="yellow"][data-b46-roi-tone]{color:#f5ce57!important}</style>';

export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return Response.json({error:'READ_ONLY'},{status:405});
 if(u.pathname==='/_stats_roi_health')return Response.json({ok:true,name,scope:'TEST_ONLY_ROI_COLOR',revision:'ROI_TONE_V1'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return Response.json({error:'PATH_NOT_ALLOWED'},{status:404});
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent','sec-ch-ua-mobile']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(new URL(u.pathname+u.search,'https://ball46.com'),{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,'https://ball46.com');if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method==='GET'&&r.ok&&[finance,card,fast].includes(u.pathname)){for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');try{return new Response(patchRoi(await r.text(),u.pathname),{status:r.status,headers:h})}catch(e){return Response.json({error:e.message},{status:502})}}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(e){e.append(css,{html:true})}}).transform(new Response(r.body,{status:r.status,statusText:r.statusText,headers:h}));
}};