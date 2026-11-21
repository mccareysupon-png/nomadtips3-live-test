import {chromium} from 'playwright';
const b=await chromium.launch();
const base='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev/?view=live';
const results=[];
try{
 for(const mode of ['native-v3','no-v3-animations','no-default-v3-runtime']){
  const p=await b.newPage({viewport:{width:1440,height:850},serviceWorkers:'block'});
  await p.addInitScript(()=>{
   try{localStorage.setItem('nomad343_dashboard_theme_v1','dark')}catch{}
   window.__b46Perf={calls:[],longs:[],spikes:[],shifts:[],at:performance.now()};
   const original=Document.prototype.querySelectorAll;
   Document.prototype.querySelectorAll=function(selector){
     const begin=performance.now();
     const result=original.call(this,selector);
     if(typeof selector==='string'&&selector.includes('.b46-v3-quote')&&selector.includes('data-nomad-odds-raw'))
       window.__b46Perf.calls.push({at:Math.round(begin),ms:Math.round((performance.now()-begin)*10)/10,count:result.length});
     return result;
   };
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__b46Perf.longs.push({at:Math.round(e.startTime),ms:Math.round(e.duration)})}).observe({type:'longtask',buffered:true})}catch{}
   let previous=performance.now();let frames=0;
   function tick(t){if(t-previous>90)window.__b46Perf.spikes.push({at:Math.round(t),gap:Math.round(t-previous)});previous=t;if(++frames<2000)requestAnimationFrame(tick)}
   requestAnimationFrame(tick);
  });
  await p.route('**/*',async route=>{
    if(!['GET','HEAD'].includes(route.request().method()))return route.abort();
    const u=new URL(route.request().url());
    if(route.request().resourceType()==='document'&&u.pathname==='/'){
      const r=await route.fetch(),body=await r.text();
      let patched=body;
      if(mode==='no-default-v3-runtime'){
        const re=/(<script id="b46-odds-flash-runtime-production">)[\s\S]*?(<\/script>)/;
        if(!re.test(body))throw Error('NO_DEFAULT_ODDS_RUNTIME_SCRIPT_TAG');
        patched=patched.replace(re,'$1$2');
      }
      if(mode==='no-v3-animations'){
        const style='<style id="b46-ablate-default-filter-test">html body .match-row .b46-v3-quote[data-b46-odds-move]{animation:none!important;filter:none!important}html body .match-row .b46-v3-quote[data-b46-odds-move]::before{animation:none!important}</style>';
        patched=patched.replace('</head>',style+'</head>');
      }
      return route.fulfill({response:r,body:patched});
    }
    return route.continue();
  });
  await p.goto(base+'&ablation='+mode,{waitUntil:'domcontentloaded',timeout:80000});
  await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>=5,null,{timeout:60000});
  const board=p.locator('.board-sections');await p.waitForTimeout(1400);
  const element=await board.boundingBox();
  if(element){await p.mouse.move(element.x+Math.min(400,element.width/2),element.y+Math.min(350,element.height/2));await p.mouse.wheel(0,600)}
  await p.waitForTimeout(11000);
  const proof=await p.evaluate(()=>{
    const a=window.__b46Perf,n=performance.now(),first=n-11000;
    const longs=a.longs.filter(x=>x.at>=first),spikes=a.spikes.filter(x=>x.at>=first),calls=a.calls.filter(x=>x.at>=first);
    return {date:Date.now(),mode:document.body.dataset.workspaceView,rows:document.querySelectorAll('.match-row').length,
       scroll:{outer:document.scrollingElement.scrollTop,board:document.querySelector('.board-sections')?.scrollTop},
       defaultStats:window.__b46OddsMovementStats?{scans:window.__b46OddsMovementStats.scans,flashes:window.__b46OddsMovementStats.flashes,baselines:window.__b46OddsMovementStats.baselines}:null,
       fullStats:window.__b46FullMarketOddsV3Stats?{scans:window.__b46FullMarketOddsV3Stats.scans,flashes:window.__b46FullMarketOddsV3Stats.flashes}:null,
       calls:{n:calls.length,max:Math.max(0,...calls.map(x=>x.ms)),avg:calls.length?calls.reduce((a,b)=>a+b.ms,0)/calls.length:0,samples:calls.slice(-8)},
       longs:{n:longs.length,sum:longs.reduce((a,b)=>a+b.ms,0),max:Math.max(0,...longs.map(x=>x.ms)),samples:longs.slice(-15)},
       spikes:{n:spikes.length,max:Math.max(0,...spikes.map(x=>x.gap)),samples:spikes.slice(-12)}
    };
  });
  results.push({mode,proof});
  console.log('B46_DEFAULT_ODDS_ABLATION '+JSON.stringify({mode,proof}));
  await p.close();
 }
}finally{await b.close()}
console.log('B46_DEFAULT_ODDS_ABLATION_SUMMARY '+JSON.stringify(results.map(x=>({mode:x.mode,defaultStats:x.proof.defaultStats,calls:x.proof.calls.n,longs:x.proof.longs,spikes:x.proof.spikes.n}))))