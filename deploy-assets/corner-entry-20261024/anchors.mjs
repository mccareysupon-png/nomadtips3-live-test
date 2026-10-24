import{createHash}from'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
for(const p of['/','/dashboard-v2-stage3-featured-facts-20261013a.js','/api/engine/signals']){
 const r=await fetch('https://ball46.com'+p+'?b46CornerAnchor='+Date.now(),{signal:AbortSignal.timeout(40000)}),s=await r.text();
 if(p.includes('signal')){console.log('CORNER_ANCHOR_API='+JSON.stringify({status:r.status,len:s.length}));continue;}
 const obj={p,status:r.status,len:s.length,sha:sha(s),type:r.headers.get('content-type')};
 if(p==='/'){obj.tagMatches=[...s.matchAll(/<script[^>]+dashboard-v2-stage3-featured-facts-20261013a\.js[^>]*>/gi)].map(m=>m[0]);}
 else{const i=s.indexOf('function signalDetailsHtml(s)');obj.func=s.slice(i,i+1500);obj.matches=(s.match(/Entry \$\{esc\(entryScore\)\}/g)||[]).length;}
 console.log('CORNER_ANCHOR='+JSON.stringify(obj).slice(0,4600));
}
