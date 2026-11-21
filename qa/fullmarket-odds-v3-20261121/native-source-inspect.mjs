const root='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
const items=[
 ['dashboard','/dashboard-v2-stage3-featured-facts-20261013a.js?b46NativeRaw=1',['b46PinRenderHas','b46PinExpanded','renderBoard','function run']],
 ['flow','/ui-sync-fixes-343-v2.js?b46NativeRaw=1',['pointAtX','getTotalLength','decorateFlow']],
 ['expanded','/expanded-match-343.js?b46NativeRaw=1',['ensurePlacement','window.scrollBy','captureAnchor']]
];
for(const [name,path,terms] of items){
 let s='',status=0;
 for(let i=0;i<35;i++){
  try{const r=await fetch(root+path+'&stamp='+Date.now(),{signal:AbortSignal.timeout(17000)});status=r.status;s=await r.text();if(r.ok&&!s.startsWith('<!DOCTYPE')&&s.length>1500)break;}catch{}
  await new Promise(r=>setTimeout(r,1750));
 }
 const hits=[];
 for(const term of terms){let start=0,n=0;
  while((start=s.indexOf(term,start))>=0&&n++<6){
    hits.push({term,at:start,before:s.slice(Math.max(0,start-280),start),after:s.slice(start,start+1650)});
    start+=term.length;
  }
 }
 console.log('B46_NATIVE_SERVICE_SOURCE '+JSON.stringify({name,status,len:s.length,hits}).slice(0,31000));
}