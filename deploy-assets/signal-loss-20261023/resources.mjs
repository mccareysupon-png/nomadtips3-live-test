const root='https://ball46.com';
const paths=['/signal.html','/signal-next.js?v=343-next-production-v1','/signal.js','/signal-page-343.css','/signal-next.css'];
const out={at:new Date().toISOString(),resources:[]};
for(const p of paths){const r=await fetch(root+p,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)}),t=await r.text();
 const item={path:p,status:r.status,bytes:t.length,type:r.headers.get('content-type')};
 if(p==='/signal.html')item.refs=[...t.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)].map(x=>x[1]).filter(x=>/\.js|\.css/i.test(x));
 if(p.endsWith('.js')||p.includes('.js?'))item.first=t.slice(0,1000);
 out.resources.push(item);}
console.log('B46_SIGNAL_RESOURCES='+JSON.stringify(out).slice(0,8500));
const script=await fetch('https://ball46.com/signal-next.js?v=343-next-production-v1',{signal:AbortSignal.timeout(30000)}).then(r=>r.text());
console.log('B46_SIGNAL_SCRIPT_FOCUS='+JSON.stringify({len:script.length,tail:script.slice(-5000),fetchRefs:[...script.matchAll(/fetch\\(|async function |function load|DOMContentLoaded|visibilitychange|setInterval|signalFeed/gi)].slice(0,28).map(m=>({at:m.index,term:m[0],s:script.slice(Math.max(0,m.index-80),m.index+200)}))}).slice(0,9200));
