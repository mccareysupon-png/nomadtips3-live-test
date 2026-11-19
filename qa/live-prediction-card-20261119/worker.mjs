const name='ball46-live-prediction-card-test-20261119',origin='https://ball46.com';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph']);
const dashboard='/dashboard-v2-stage3-featured-facts-20261013a.js';
function exact(s,a,b,id){
 const n=s.split(a).length-1;if(n<1)throw Error('RENDER_SOURCE_DRIFT '+id);return s.replaceAll(a,b);
}
const badgeFrom="label=n===1?'Signal':'Signals'",badgeTo="label=n===1?'Prediction':'Predictions'";
export function patchHtml(s){
 s=exact(s,'<i class="workspace-nav-mark signal"></i>Signal</span>','<i class="workspace-nav-mark signal"></i>Live Predictions</span>','desktop-sidebar-label');
 s=exact(s,'data-b46m-page="signal">'+String.fromCharCode(36)+"{svg('trend')}"+'<span>Signals</span>','data-b46m-page="signal">'+String.fromCharCode(36)+"{svg('trend')}"+'<span>Live Predictions</span>','mobile-drawer-label');
 s=exact(s,badgeFrom,badgeTo,'desktop-badge');
 s=exact(s,"f.signalCount+' signal'","f.signalCount+(f.signalCount===1?' Prediction':' Predictions')",'mobile-badge');
 s=exact(s,'content:"ACTIVE SIGNALS"','content:"ACTIVE PREDICTIONS"','featured-css');
 s=exact(s,"s.dataset.market='signal';s.textContent='SIGNAL'","s.dataset.market='signal';s.textContent='LIVE PREDICTION'",'league-heading');
 const css='<style id="b46-featured-prediction-label-test">html body :is(#b46gn-detail#b46gn-detail#b46gn-detail,.live-stage-grid > .right-rail) .featured-card[data-featured] .feature-signal::before{content:"ACTIVE PREDICTIONS"!important}</style>';
 s=exact(s,'</body>',css+'</body>','featured-css-final');
 return s;
}
export function patchDashboard(s){
 s=exact(s,badgeFrom,badgeTo,'pin-badge');
 s=exact(s,'<span>Signal '+String.fromCharCode(36)+'{esc(entryMin','<span>Prediction '+String.fromCharCode(36)+'{esc(entryMin','featured-minute');
 s=exact(s,"setText('[data-featured-kicker]',signalView?'FEATURED SIGNAL':'FEATURED MATCH');",'','remove-mode-heading');
 s=exact(s,"signalTitle=sigs.map(signalSummary).join(' • ');if(signal)","signalTitle=sigs.map(signalSummary).join(' • ');setText('[data-featured-kicker]',hasSignals?'FEATURED LIVE PREDICTION':'FEATURED MATCH');if(signal)",'selected-match-heading');
 s=exact(s,'function clearFeatured(){',"function clearFeatured(){setText('[data-featured-kicker]','FEATURED MATCH');",'empty-heading');
 return s;
}
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return reply({error:'READ_ONLY'},405);
 if(u.pathname==='/_prediction_test_health')return reply({ok:true,name,scope:'SHARED_RENDERER_SOURCE',overlay:false,featuredLabel:'ACTIVE PREDICTIONS',sidebarLabel:'Live Predictions'});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return reply({error:'PATH_NOT_ALLOWED'},404);
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const dest=new URL(u.pathname+u.search,origin);
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(dest,{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,origin);if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 const html=pages.has(u.pathname)&&h.get('content-type')?.includes('text/html');
 if(req.method!=='GET'||!r.ok||(!html&&u.pathname!==dashboard))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 h.set('cache-control','no-store');
 try{
 const source=await r.text(),patched=html?patchHtml(source):patchDashboard(source);
 return new Response(patched,{status:r.status,headers:h});
 }catch(e){return reply({error:String(e.message),scope:'TEST_ONLY'},502)}
}};