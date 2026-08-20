const dot=document.querySelector('#goalooStatusDot');
if(dot){
  let runtime={workerUrl:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev',refreshSeconds:15};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const ageSeconds=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/1000)):null;};
  const setState=(state,label)=>{
    dot.className=`goaloo-status-dot goaloo-${state}`;
    dot.title=`Goaloo ${label}`;
    dot.setAttribute('aria-label',`Goaloo ${label}`);
  };
  const getJson=async path=>{
    const r=await fetch(`${runtime.workerUrl}${path}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const evaluate=(health,live)=>{
    if(!health&&!live)return['error','ERROR'];
    const core=health?.coreStatsPipe||live?.coreStatsPipe||{};
    const stamp=live?.generatedAt||health?.lastCycle||core?.at||null;
    const age=ageSeconds(stamp);
    if(age!==null&&age>300)return['stale','ENGINE STALE'];
    if(String(core?.status||'').toUpperCase()==='ERROR')return['error','ERROR'];
    const indexMatches=num(health?.indexMatches??live?.indexMatchCount);
    const discovered=num(health?.discovered??live?.discoveredLive);
    const matchCount=num(core?.matchCount??health?.liveMatches??live?.rawMatchCount);
    if(indexMatches===0&&discovered===0&&matchCount===0)return['empty','EMPTY'];
    return['ok','OK'];
  };
  const refresh=async()=>{
    try{
      const [healthResult,liveResult]=await Promise.allSettled([getJson('/health'),getJson('/live')]);
      const health=healthResult.status==='fulfilled'?healthResult.value:null;
      const live=liveResult.status==='fulfilled'?liveResult.value:null;
      const [state,label]=evaluate(health,live);
      setState(state,label);
    }catch{
      setState('error','ERROR');
    }
  };
  setState('checking','CHECKING');
  fetch('./runtime.json',{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(v=>{runtime={...runtime,...v};}).catch(()=>{}).finally(()=>{
    refresh();
    setInterval(refresh,Math.max(15000,Number(runtime.refreshSeconds||15)*1000));
  });
}
