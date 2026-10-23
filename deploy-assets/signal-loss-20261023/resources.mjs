const root='https://ball46.com';
const paths=['/signal.html','/signal-next.js?v=343-next-production-v1','/signal.js','/signal-page-343.css','/signal-next.css'];
const out={at:new Date().toISOString(),resources:[]};
for(const p of paths){const r=await fetch(root+p,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)}),t=await r.text();
 const item={path:p,status:r.status,bytes:t.length,type:r.headers.get('content-type')};
 if(p==='/signal.html')item.refs=[...t.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)].map(x=>x[1]).filter(x=>/\.js|\.css/i.test(x));
 if(p.endsWith('.js')||p.includes('.js?'))item.first=t.slice(0,1000);
 out.resources.push(item);}
console.log('B46_SIGNAL_RESOURCES='+JSON.stringify(out).slice(0,8500));