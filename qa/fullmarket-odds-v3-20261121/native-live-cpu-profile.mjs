import {chromium} from 'playwright';
const browser=await chromium.launch();
const ready='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
let deployed=false;
for(let i=0;i<44;i++){
 try{const r=await fetch(ready+'/__fullmarket_health?perf='+Date.now(),{signal:AbortSignal.timeout(18000)});if(r.ok){const h=await r.json();if(h.nativePerfTest==='FLOW_POLYLINE_FAST_EXPANDED_SCROLL_SCOPE_OVERSCROLL_TEST'){deployed=true;break}}}catch{}
 await new Promise(r=>setTimeout(r,1300));
}
if(!deployed)throw Error('OPTIMIZED_NATIVE_ASSETS_NOT_DEPLOYED');
for(const [resource,marker] of [
 ['/dashboard-v2-stage3-featured-facts-20261013a.js','b46PinExpandedCacheTick'],
 ['/ui-sync-fixes-343-v2.js','b46FlowPolylineCache'],
 ['/expanded-match-343.js',"board.scrollBy(0,delta)"]
]){
 const r=await fetch(ready+resource+'?perf='+Date.now(),{signal:AbortSignal.timeout(20000)});
 const body=await r.text();
 console.log('B46_NATIVE_OPT_RESOURCE '+JSON.stringify({resource,status:r.status,contentType:r.headers.get('content-type'),perfHeader:r.headers.get('x-b46-test-native-perf'),bytes:body.length,hasMarker:body.includes(marker),start:body.slice(0,900)}));
 if(!r.ok)throw Error('NATIVE_ASSET_UNAVAILABLE_'+resource);
 if(!body.includes(marker))console.log('B46_NATIVE_OPT_PASSTHROUGH '+resource);
}
const url='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev/?view=live';
const sessions=[['live-scroll-no-default-v3',false],['expanded-fullmarket-native-tab',true]];
try{
 for(const [name,expand] of sessions){
  const p=await browser.newPage({viewport:{width:1440,height:850},serviceWorkers:'block'});
  const resourceResponses=[];
  p.on('response',response=>{if(/dashboard-v2-stage3-featured|ui-sync-fixes-343|expanded-match-343/.test(response.url()))resourceResponses.push({url:response.url(),status:response.status(),nativePerf:response.headers()['x-b46-test-native-perf']||null})});
  await p.addInitScript(()=>{try{localStorage.setItem('nomad343_dashboard_theme_v1','dark')}catch{}});
  await p.route('**/*',async r=>{
   if(!['GET','HEAD'].includes(r.request().method()))return r.abort();
   const u=new URL(r.request().url());
   if(r.request().resourceType()==='document'&&u.pathname==='/'){
    const src=await r.fetch(),html=await src.text();
    const patched=html.replace(/(<script id="b46-odds-flash-runtime-production">)[\s\S]*?(<\/script>)/,'$1$2');
    if(patched===html)throw Error('DEFAULT_SCRIPT_NOT_REMOVED');
    return r.fulfill({response:src,body:patched});
   }
   return r.continue();
  });
  await p.goto(url+'&profiler='+name,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>5,null,{timeout:55000});
  await p.waitForTimeout(700);
  let before={};let after={};
  if(expand){
    before=await p.evaluate(()=>{
     const board=document.querySelector('.board-sections'),doc=document.scrollingElement;
     board.scrollTop=330;doc.scrollTop=0;
     const br=board.getBoundingClientRect(),r=[...document.querySelectorAll('.status-section[data-status-section="live"] .match-row')].find(x=>{const b=x.getBoundingClientRect();return b.y>br.y+60&&b.bottom<br.bottom-50});
     if(!r)return {error:'NO_VISIBLE_ROW'};
     r.click();
     return {fixture:r.dataset.matchId,boardBefore:board.scrollTop,docBefore:doc.scrollTop};
    });
    await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-tab.has-data'),null,{timeout:20000});
    await p.waitForTimeout(800);
    // Native DOM click avoids Playwright locator auto-scroll.
    after=await p.evaluate(()=>{
      const board=document.querySelector('.board-sections'),doc=document.scrollingElement;
      const before={board:board.scrollTop,doc:doc.scrollTop};
      const first=document.querySelector('.expand-full-market-card .fmb-tab.has-data');
      first.click();
      return {before,book:first.dataset.fmbBook};
    });
    await p.waitForTimeout(700);
    after.now=await p.evaluate(()=>({board:document.querySelector('.board-sections').scrollTop,doc:document.scrollingElement.scrollTop,fullHeight:document.querySelector('.expand-full-market-card')?.getBoundingClientRect().height}));
    const accuracy=await p.evaluate(()=>{
     const root=document.querySelector('.expand-flow-chart svg');
     const paths=[...root?.querySelectorAll('path.expand-flow-line')||[]];
     const icons=[...root?.querySelectorAll('[data-b46-event-icon]')||[]].map(e=>{
      const t=e.getAttribute('transform')||'',m=t.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
      return m?{x:Number(m[1]),y:Number(m[2])}:null
     }).filter(Boolean);
     const normal=(path,x)=>{const len=path.getTotalLength();let lo=0,hi=len;for(let i=0;i<24;i++){const mid=(lo+hi)/2,q=path.getPointAtLength(mid);if(q.x<x)lo=mid;else hi=mid}return path.getPointAtLength((lo+hi)/2)};
     const errors=icons.map(v=>Math.min(...paths.map(path=>{const p=normal(path,v.x);return Math.hypot(p.x-v.x,p.y-v.y)})));
     return {paths:paths.length,icons:icons.length,maxErrorPx:Math.max(0,...errors),meanErrorPx:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:0,allPolyline:paths.every(p=>/^[MLml\d.,\s+-]+$/.test(p.getAttribute('d')||''))};
    });
    console.log('B46_NATIVE_FLOW_POLYLINE_ACCURACY '+JSON.stringify(accuracy));
    if(accuracy.icons>0&&accuracy.maxErrorPx>0.3)throw Error('FLOW_ICON_GEOMETRY_REGRESSION_'+JSON.stringify(accuracy));
    if(after.before.board!==after.now.board||after.before.doc!==after.now.doc)throw Error('NATIVE_BOOKMAKER_CLICK_SCROLL_JUMP_'+JSON.stringify(after));
  }else{
    await p.evaluate(()=>{document.querySelector('.board-sections').scrollTop=430;document.scrollingElement.scrollTop=0});
  }
  const client=await p.context().newCDPSession(p);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval',{interval:1000});
  await client.send('Profiler.start');
  await p.waitForTimeout(8200);
  const profile=(await client.send('Profiler.stop')).profile;
  await client.send('Profiler.disable');
  const nodes=new Map(profile.nodes.map(n=>[n.id,n]));
  const childToParent=new Map();
  for(const n of profile.nodes)for(const c of n.children||[])childToParent.set(c,n.id);
  const self=new Map(),inclusive=new Map();
  for(let i=0;i<(profile.samples?.length||0);i++){
    const id=profile.samples[i],ms=(profile.timeDeltas?.[i]||1000)/1000;
    self.set(id,(self.get(id)||0)+ms);
    let pId=id,j=0;
    while(pId&&j++<40){inclusive.set(pId,(inclusive.get(pId)||0)+ms);pId=childToParent.get(pId)}
  }
  const value=(node,ms,inc)=>({fn:node.callFrame?.functionName||'',url:node.callFrame?.url?.replace(/^https:\/\/[^/]+/,'').slice(0,130)||'',line:node.callFrame?.lineNumber,ms:Math.round(ms),inclusiveMs:Math.round(inc||0)});
  const topSelf=[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,ms])=>value(nodes.get(id),ms,inclusive.get(id)));
  const topInclusive=[...inclusive].filter(([id])=>nodes.get(id)?.callFrame?.functionName).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([id,ms])=>value(nodes.get(id),self.get(id)||0,ms));
  const tally=new Map();
  for(const [id,ms] of self){
    let file=nodes.get(id)?.callFrame?.url||'<internal>';file=file.replace(/^https:\/\/[^/]+/,'');const name=file||'<inline>';
    tally.set(name,(tally.get(name)||0)+ms);
  }
  const topFiles=[...tally].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([file,ms])=>({file,ms:Math.round(ms)}));
  const loadedScripts=await p.evaluate(()=>[...document.scripts].filter(s=>/dashboard-v2-stage3-featured|ui-sync-fixes-343|expanded-match-343/.test(s.src)).map(s=>({url:s.src,host:new URL(s.src).host})));
  console.log('B46_NATIVE_LIVE_CPU_PROFILER '+JSON.stringify({name,before,after,loadedScripts,resourceResponses,samples:profile.samples?.length,totalMs:Math.round([...self.values()].reduce((a,b)=>a+b,0)),topSelf,topInclusive,topFiles}).slice(0,32000));
  await p.close();
 }
}finally{await browser.close()}