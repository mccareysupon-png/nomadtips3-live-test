import {chromium} from 'playwright';
const b=await chromium.launch();
const base='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
let ready=false;
for(let i=0;i<30;i++){
 try{const r=await fetch(base+'/__fullmarket_health?date='+Date.now());if(r.ok&&(await r.json()).nativePerfTest==='FLOW_POLYLINE_FAST_EXPANDED_SCROLL_SCOPE_OVERSCROLL_TEST'){ready=true;break}}catch{}
 await new Promise(r=>setTimeout(r,1400));
}
if(!ready)throw Error('SAFE_FLOW_ROLLBACK_NOT_YET_DEPLOYED');
const p=await b.newPage({viewport:{width:1440,height:950},serviceWorkers:'block'});
await p.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
await p.goto(base+'/?view=live',{waitUntil:'domcontentloaded',timeout:70000});
await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>5,null,{timeout:50000});
let selected=false;
for(let i=0;i<7;i++){
 const row=p.locator('.status-section[data-status-section="live"] .match-row').nth(i);
 await row.click({position:{x:80,y:30},force:true}).catch(()=>{});
 try{await p.waitForFunction(()=>document.querySelector('.expand-flow-chart svg .expand-flow-line.home,.expand-flow-chart svg .b46-signal-flow-line-home'),null,{timeout:3800});selected=true;break}catch{}
}
if(!selected)throw Error('NATIVE_FLOW_CHART_PATH_NOT_AVAILABLE');
await p.waitForTimeout(150);
const output=await p.evaluate(()=>{
 const start=performance.now(),result=[];
 const pathNodes=[...document.querySelectorAll('.expand-flow-chart svg path')].filter(p=>p.matches('.expand-flow-line.home,.expand-flow-line.away,.b46-signal-flow-line-home,.b46-signal-flow-line-away'));
 const ref=(p,x)=>{
  const len=p.getTotalLength();let lo=0,hi=len;for(let i=0;i<24;i++){const mid=(lo+hi)/2,q=p.getPointAtLength(mid);if(q.x<x)lo=mid;else hi=mid}
  return p.getPointAtLength((lo+hi)/2);
 };
 const approximate=(p,n,xs)=>{
  const t0=performance.now(),len=p.getTotalLength(),points=[];
  for(let i=0;i<=n;i++){const q=p.getPointAtLength(len*i/n);points.push({x:q.x,y:q.y})}
  const built=performance.now()-t0;let totalErr=0,maxErr=0;
  const t1=performance.now();
  const values=xs.map(x=>{
   let lo=0,hi=points.length-1;
   while(hi-lo>1){const mid=(lo+hi)>>>1;if(points[mid].x<x)lo=mid;else hi=mid}
   const a=points[lo],z=points[hi],factor=Math.max(0,Math.min(1,(x-a.x)/(z.x-a.x||1)));
   return {x:a.x+(z.x-a.x)*factor,y:a.y+(z.y-a.y)*factor};
  });
  const evalMs=performance.now()-t1;
  return {n,builtMs:Math.round(built),lookupMs:+evalMs.toFixed(3),values};
 };
 for(const path of pathNodes.slice(0,2)){
   const len=path.getTotalLength(),a=path.getPointAtLength(0),z=path.getPointAtLength(len);
   const xs=Array.from({length:20},(_,i)=>a.x+(z.x-a.x)*(i+.5)/20);
   const t0=performance.now(),reference=xs.map(x=>ref(path,x)),originalMs=performance.now()-t0;
   const methods=[12,20,32,48,64,96].map(n=>{
    const x=approximate(path,n,xs);let maxErr=0,meanErr=0;
    for(let i=0;i<xs.length;i++){const err=Math.hypot(x.values[i].x-reference[i].x,x.values[i].y-reference[i].y);maxErr=Math.max(maxErr,err);meanErr+=err}
    return {n,builtMs:x.builtMs,lookupMs:x.lookupMs,maxErr:+maxErr.toFixed(2),meanErr:+(meanErr/xs.length).toFixed(2)};
   });
   const d=path.getAttribute('d')||'',re=/([ML])\s*(-?(?:\d+\.?\d*|\.\d+))[\s,]+(-?(?:\d+\.?\d*|\.\d+))/gi;
   const matches=[...d.matchAll(re)],points=matches.map(m=>({x:Number(m[2]),y:Number(m[3])}));
   const leftovers=d.replace(re,'').trim();
   const monotonicFailures=points.map((q,i)=>i&&q.x<=points[i-1].x?{i,prev:points[i-1],next:q}:null).filter(Boolean);
   result.push({d:d.slice(0,450),dEnd:d.slice(-450),len:+len.toFixed(2),segments:(d.match(/[MLCQAHVSZ]/gi)||[]).length,from:a.x,to:z.x,originalMs:Math.round(originalMs),parse:{matches:matches.length,commands:matches.reduce((a,m)=>(a[m[1].toUpperCase()]=(a[m[1].toUpperCase()]||0)+1,a),{}),leftovers:leftovers.slice(0,220),monotonicFailures:monotonicFailures.slice(0,5),valid:matches.length>=2&&matches[0][1].toUpperCase()==='M'&&matches.slice(1).every(m=>m[1].toUpperCase()==='L')&&!leftovers&&!monotonicFailures.length},methods});
 }
 return {totalMs:Math.round(performance.now()-start),paths:result};
});
console.log('B46_FLOW_PATH_APPROX_BENCHMARK '+JSON.stringify(output));
await p.close();await b.close();