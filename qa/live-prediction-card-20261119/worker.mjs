const name='ball46-live-prediction-card-test-20261119',origin='https://ball46.com';
const pages=new Set(['/','/index','/index.html','/statistics','/statistics.html','/statistics-next.html']);
const apis=new Set(['/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health','/api/hub/snapshot','/api/hub/health','/api/prediction-vote','/b46-receiver-v1/graph']);
const client=String.raw`(()=>{
const isMain=()=>!(/statistics/i.test(location.pathname)||/statistics/i.test(new URLSearchParams(location.search).get('view')||''));
const excluded=e=>e.closest('nav,aside,[data-stat-market],[data-sp-table-body],#b46-finance-chart-card,[class*="featured" i],[id*="featured" i]');
function update(root){
 if(!isMain())return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const list=[];while(walker.nextNode())list.push(walker.currentNode);
 for(const n of list){
  const e=n.parentElement;if(!e||e.closest('script,style,textarea,template'))continue;
  const t=n.nodeValue.trim();
  // Featured panel text only. Match visible words regardless of CSS capitalization.
  if(/^featured signal$/i.test(t)||/^active signals$/i.test(t)){
   const v=/^featured/i.test(t)?'FEATURED LIVE PREDICTION':'ACTIVE PREDICTIONS';
   if(n.nodeValue!==n.nodeValue.replace(t,v))n.nodeValue=n.nodeValue.replace(t,v);continue;
  }
  if(/^Signal(?:\s+\d+(?:\+\d+)?)?\s*['’′]?\s*$/i.test(t)){
   let p=e,inside=!!e.closest('[class*="featured" i],[id*="featured" i]');
   for(let i=0;!inside&&p&&i<12;i++,p=p.parentElement){
    if(p.textContent.length<12000&&/ACTIVE\s*(?:SIGNALS|PREDICTIONS)/i.test(p.textContent)&&/MATCH\s*FACTS/i.test(p.textContent))inside=true;
   }
   if(inside&&t!=='SIGNAL'){n.nodeValue=n.nodeValue.replace(/Signal/i,'Prediction');continue}
  }
  if(excluded(e))continue;
  if(t==='SIGNAL'){
   let p=e;let found=false;
   for(let i=0;p&&i<4;i++,p=p.parentElement){if(/OVER\s*\/\s*UNDER/i.test(p.textContent)&&p.textContent.length<1000){found=true;break}}
   if(found)n.nodeValue=n.nodeValue.replace('SIGNAL','LIVE PREDICTION');
  }else if(/^([•·]\s*)?\d+\s+Signals?$/i.test(t)){
   n.nodeValue=n.nodeValue.replace(/(\d+)\s+Signals?/i,(_,v)=>v+' '+(Number(v)===1?'Prediction':'Predictions'));
  }else if(/^Signals?$/i.test(t)&&e.closest('[data-inline-signal-count]')){
   const badge=e.closest('[data-inline-signal-count]');const count=Number(badge.getAttribute('data-inline-signal-count'));
   if(count>0)n.nodeValue=n.nodeValue.replace(/Signals?/i,count===1?'Prediction':'Predictions');
  }
 }
}
let queued=false;
const run=()=>{queued=false;if(document.body)update(document.body)};
const queue=()=>{if(!queued){queued=true;requestAnimationFrame(run)}};
const start=()=>{run();new MutationObserver(queue).observe(document.body,{subtree:true,childList:true,characterData:true});};
if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();`;
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(!['GET','HEAD'].includes(req.method))return reply({error:'READ_ONLY'},405);
 if(u.pathname==='/_prediction_test_health')return reply({ok:true,name,scope:'MAIN_CARD_AND_FEATURED'});
 if(u.pathname==='/_prediction-card-test.js')return new Response(req.method==='HEAD'?null:client,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
 if(!pages.has(u.pathname)&&!apis.has(u.pathname)&&!(/^\/[a-zA-Z0-9_./-]+\.(js|mjs|css|svg|png|gif|woff2?|ico|jpe?g|webp|json|html|txt|map|avif)$/i.test(u.pathname)&&!/^\/(?:api|b46-receiver-v1|admin|internal)\//.test(u.pathname)))return reply({error:'PATH_NOT_ALLOWED'},404);
 const headers=new Headers();for(const k of ['accept','accept-language','user-agent']){const v=req.headers.get(k);if(v)headers.set(k,v.slice(0,512))}
 const dest=new URL(u.pathname+u.search,origin);
 const r=await env.B46_PRODUCTION_READ.fetch(new Request(dest,{method:req.method,headers,redirect:'manual'}));
 const h=new Headers(r.headers);h.delete('set-cookie');h.set('x-robots-tag','noindex, nofollow');
 const loc=h.get('location');if(loc){const d=new URL(loc,origin);if(['ball46.com','www.ball46.com'].includes(d.hostname))h.set('location',new URL(d.pathname+d.search+d.hash,req.url).toString())}
 if(req.method!=='GET'||!r.ok||!pages.has(u.pathname)||!h.get('content-type')?.includes('text/html'))return new Response(req.method==='HEAD'?null:r.body,{status:r.status,headers:h});
 for(const k of ['content-length','content-encoding','etag','last-modified'])h.delete(k);
 h.set('cache-control','no-store');
 return new HTMLRewriter().on('head',{element(el){el.append('<script defer src="/_prediction-card-test.js"></script>',{html:true})}}).transform(new Response(r.body,{status:r.status,headers:h}));
}};