const STALE_FACTOR=6;

async function loadRuntime(){
  const fallback={workerUrl:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev',refreshSeconds:15};
  try{
    return {...fallback,...await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json())};
  }catch{
    return fallback;
  }
}

function ageSeconds(value){
  const ts=Date.parse(value||'');
  return Number.isFinite(ts)?Math.max(0,Math.floor((Date.now()-ts)/1000)):null;
}

function text(id,value){
  const el=document.getElementById(id);
  if(el)el.textContent=value;
}

function markStale(age){
  const seconds=Number.isFinite(age)?age:null;
  const minutes=seconds===null?'?':Math.max(1,Math.floor(seconds/60));
  const holder=document.getElementById('candidateCards');
  if(holder){
    holder.innerHTML=`<div class="empty"><strong>DATA STALE</strong><br>Live snapshot is ${minutes}m old. Previous matches are hidden until a fresh scan arrives.</div>`;
  }
  text('liveCount','—');
  text('watching','—');
  text('nearSignal','—');
  text('liveStatusText','DATA STALE · waiting for fresh scan');
  text('monitorNote','Old live matches hidden');
  const badge=document.getElementById('systemBadge');
  const systemText=document.getElementById('systemText');
  if(badge)badge.className='live-system offline';
  if(systemText)systemText.textContent='DATA STALE';
  const freshness=document.getElementById('freshness');
  if(freshness){
    freshness.textContent=seconds===null?'Updated —':`Updated ${minutes}m ago`;
    freshness.className='freshness stale';
  }
}

async function guard(){
  const runtime=await loadRuntime();
  const threshold=Math.max(90,(Number(runtime.refreshSeconds)||15)*STALE_FACTOR);
  try{
    const response=await fetch(`${runtime.workerUrl}/live`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    const generatedAt=payload?.generatedAt||payload?.realMarketPipe?.at||null;
    const age=ageSeconds(generatedAt);
    if(age===null||age>threshold)markStale(age);
  }catch{
    markStale(null);
  }
}

setTimeout(guard,1200);
setInterval(guard,15000);
