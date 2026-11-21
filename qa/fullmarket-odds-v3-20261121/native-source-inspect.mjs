const origins=[
 ['dashboard','https://ball46.com/dashboard-v2-stage3-featured-facts-20261013a.js?v=b46-screen-refresh-5s-20261104&codex_pc_default_dark=1'],
 ['flow','https://ball46.com/ui-sync-fixes-343-v2.js?v=statistics-no-total-cap-20261005'],
 ['expanded','https://ball46.com/expanded-match-343.js?v=b46-eventflow-same-minute-20261118']
];
for(const [name,url] of origins){
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('HTTP_'+r.status);
  const s=await r.text();const lines=s.split('\n');
  const matches=[];
  const terms=name==='dashboard'?['b46PinRenderHas','b46PinExpanded','renderBoard(','function renderBoard','function run','setInterval']:name==='flow'?['pointAtX','decorateFlow','decorateExpanded','getTotalLength','MutationObserver']:['ensurePlacement','renderExpanded','scrollIntoView','scrollTop'];
  for(const term of terms){
   const hits=[];for(let i=0;i<lines.length;i++)if(lines[i].includes(term))hits.push(i);
   for(const at of hits.slice(0,4)){
    const from=Math.max(0,at-7),to=Math.min(lines.length,at+16);
    const fragment=lines.slice(from,to).map((t,j)=>(from+j+1)+': '+t).join('\n');
    matches.push({term,line:at+1,fragment:fragment.slice(0,6400)});
   }
  }
  console.log('B46_NATIVE_SOURCE_INSPECT '+JSON.stringify({name,bytes:s.length,totalLines:lines.length,matches}).slice(0,49000));
 }catch(e){console.log('B46_NATIVE_SOURCE_INSPECT_ERROR '+JSON.stringify({name,error:String(e)}))}
}