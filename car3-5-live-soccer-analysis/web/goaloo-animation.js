(()=>{
  const $=s=>document.querySelector(s);
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let runtime=null,currentMatchId=null,lastSourceOk=0,timer=null,pollMs=1500,playing=false,queue=[],seen=new Set(),seenPoints=new Map(),ball={x:.5,y:.5},generation=0;

  function animationUrl(matchId){
    const explicit=String(runtime?.animationUrl||'').trim();
    if(explicit)return `${explicit}${explicit.includes('?')?'&':'?'}id=${encodeURIComponent(matchId)}&t=${Date.now()}`;
    const live=String(runtime?.liveUrl||runtime?.workerUrl||'').trim();
    const base=live.replace(/\/live(?:\?.*)?$/,'').replace(/\/$/,'');
    return `${base}/animation?id=${encodeURIComponent(matchId)}&t=${Date.now()}`;
  }

  function selectedMatchId(){
    const active=$('.signal-item.active[data-id]');
    const any=$('.signal-item[data-id]');
    const id=String(active?.dataset.id||any?.dataset.id||'').trim();
    return /^\d+$/.test(id)?id:null;
  }

  function ensureUi(){
    const pitch=$('#pitch');
    if(!pitch)return null;
    if(!$('#sourceBall')){
      const style=document.createElement('style');
      style.id='car35-source-animation-style';
      style.textContent=`
        #sourceBall{position:absolute;z-index:7;left:0;top:0;width:15px;height:15px;border:2px solid rgba(255,255,255,.98);background:#121416;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,.55),0 0 0 4px rgba(243,198,35,.12);transform:translate3d(50%,50%,0);opacity:0;pointer-events:none;will-change:transform;}
        #sourceTrail{position:absolute;z-index:6;height:3px;border-radius:999px;background:linear-gradient(90deg,rgba(243,198,35,0),rgba(243,198,35,.56));transform-origin:right center;opacity:0;pointer-events:none;will-change:left,top,width,transform;}
        #pitch.source-xy-active #sourceBall{opacity:1}
        #pitch.source-xy-active #sourceTrail{opacity:.7}
        #pitch.source-xy-active #ball{opacity:0!important}
        #pitch.source-xy-active #zoneGlow{opacity:0!important}
        @media(prefers-reduced-motion:reduce){#sourceTrail{display:none}}
      `;
      document.head.appendChild(style);
      pitch.insertAdjacentHTML('beforeend','<div id="sourceTrail" aria-hidden="true"></div><div id="sourceBall" aria-hidden="true"></div>');
    }
    return pitch;
  }

  function setSourceActive(active){
    const pitch=ensureUi();
    if(!pitch)return;
    pitch.classList.toggle('source-xy-active',Boolean(active));
  }

  function setBall(x,y,from=ball){
    const pitch=ensureUi(),el=$('#sourceBall'),trail=$('#sourceTrail');
    if(!pitch||!el)return;
    const rect=pitch.getBoundingClientRect();
    const px=clamp(x)*rect.width,py=clamp(y)*rect.height;
    el.style.transform=`translate3d(${px}px,${py}px,0) translate(-50%,-50%)`;
    if(trail){
      const fx=clamp(from.x)*rect.width,fy=clamp(from.y)*rect.height,dx=px-fx,dy=py-fy;
      const len=Math.min(92,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx)*180/Math.PI;
      trail.style.left=`${px}px`;trail.style.top=`${py}px`;trail.style.width=`${Math.max(14,len)}px`;
      trail.style.transform=`translate(-100%,-50%) rotate(${angle}deg)`;
    }
  }

  function ease(t){return 1-Math.pow(1-t,3);}
  function moveBall(target,duration=360,token=generation){
    return new Promise(resolve=>{
      const start={...ball},end={x:clamp(target.x),y:clamp(target.y)};
      if(reduceMotion){ball=end;setBall(ball.x,ball.y,start);return resolve();}
      const begun=performance.now();
      const tick=now=>{
        if(token!==generation)return resolve();
        const p=Math.min(1,(now-begun)/duration),e=ease(p);
        ball={x:start.x+(end.x-start.x)*e,y:start.y+(end.y-start.y)*e};
        setBall(ball.x,ball.y,start);
        if(p<1)requestAnimationFrame(tick);else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  function hasSourceXY(event){
    return event?.coordinateSource==='SOURCE_XY'&&(
      (Array.isArray(event?.points)&&event.points.some(p=>Number.isFinite(Number(p?.x))&&Number.isFinite(Number(p?.y))))||
      (Number.isFinite(Number(event?.x))&&Number.isFinite(Number(event?.y)))
    );
  }

  function eventLabel(event){
    const minute=Number.isFinite(Number(event?.minute))?`${Number(event.minute)}'`:'LIVE';
    const injury=Number(event?.injuryMinute)>0?`+${Number(event.injuryMinute)}`:'';
    return `${minute}${injury} · ${String(event?.type||'LIVE ACTIVITY').replaceAll('_',' ')}`;
  }

  function updatePitchEvent(event){
    const el=$('#pitchEvent');if(!el||!event)return;
    el.textContent=eventLabel(event);
  }

  function teamName(event,payload){
    if(event?.team==='HOME')return payload?.match?.home||'Home';
    if(event?.team==='AWAY')return payload?.match?.away||'Away';
    return '';
  }

  function renderEvents(payload){
    const events=Array.isArray(payload?.events)?[...payload.events].sort((a,b)=>(Number(b?.id)||0)-(Number(a?.id)||0)).slice(0,20):[];
    const list=$('#eventList'),count=$('#eventCount');
    if(count)count.textContent=`${events.length} events`;
    if(!list||!events.length)return;
    list.innerHTML=events.map(e=>`<div class="event"><time>${esc(Number.isFinite(Number(e.minute))?e.minute:'—')}'</time><span>${esc(e.type||'Event')}</span><small>${esc(teamName(e,payload))}</small></div>`).join('');
  }

  async function animate(event,token=generation){
    updatePitchEvent(event);
    if(!hasSourceXY(event)){setSourceActive(false);return;}
    setSourceActive(true);
    const points=Array.isArray(event.points)?event.points.filter(p=>Number.isFinite(Number(p?.x))&&Number.isFinite(Number(p?.y))).map(p=>({x:clamp(p.x),y:clamp(p.y)})):[];
    if(!points.length)points.push({x:clamp(event.x),y:clamp(event.y)});
    const each=Math.max(140,Math.min(420,1050/Math.max(1,points.length)));
    for(const point of points){if(token!==generation)return;await moveBall(point,each,token);}
  }

  async function drain(){
    if(playing)return;playing=true;
    while(queue.length){
      const item=queue.shift();
      if(item.matchId!==currentMatchId)continue;
      if(item.generation!==generation)continue;
      await animate(item.event,item.generation);
    }
    playing=false;
  }

  function reset(matchId){
    generation++;currentMatchId=matchId;lastSourceOk=0;seen=new Set();seenPoints=new Map();queue=[];playing=false;ball={x:.5,y:.5};
    setSourceActive(false);setBall(.5,.5,{x:.5,y:.5});
  }

  function ingest(payload,matchId){
    if(currentMatchId!==matchId)reset(matchId);
    lastSourceOk=Date.now();
    if(Number.isFinite(Number(payload?.pollMs)))pollMs=Math.max(1000,Math.min(5000,Number(payload.pollMs)));
    renderEvents(payload);
    const incoming=Array.isArray(payload?.events)?payload.events:[];
    if(!incoming.length){setSourceActive(false);return;}

    if(!seen.size){
      for(const event of incoming.slice(0,-1)){
        const key=String(event.id);seen.add(key);
        const pointIds=(event.points||[]).map(p=>Number(p?.id)).filter(Number.isFinite);
        if(pointIds.length)seenPoints.set(key,Math.max(...pointIds));
      }
    }
    const fresh=incoming.filter(event=>!seen.has(String(event.id)));
    for(const event of fresh.slice(-8)){
      const key=String(event.id);seen.add(key);
      const pointIds=(event.points||[]).map(p=>Number(p?.id)).filter(Number.isFinite);
      if(pointIds.length)seenPoints.set(key,Math.max(...pointIds));
      queue.push({matchId,event,generation});
    }
    const current=payload.current;
    if(current&&seen.has(String(current.id))&&hasSourceXY(current)){
      const key=String(current.id),lastPoint=seenPoints.get(key)??-Infinity;
      const newPoints=(current.points||[]).filter(p=>Number.isFinite(Number(p?.id))&&Number(p.id)>lastPoint);
      if(newPoints.length){
        seenPoints.set(key,Math.max(...newPoints.map(p=>Number(p.id))));
        const last=newPoints[newPoints.length-1];
        queue.push({matchId,event:{...current,points:newPoints,x:last.x,y:last.y},generation});
      }
    }
    if(queue.length>10)queue=queue.slice(-10);
    if(!fresh.length&&payload.current){
      updatePitchEvent(payload.current);
      if(hasSourceXY(payload.current)&&!$('#pitch')?.classList.contains('source-xy-active')){
        setSourceActive(true);
        ball={x:clamp(payload.current.x),y:clamp(payload.current.y)};
        setBall(ball.x,ball.y,ball);
      }
    }
    drain();
  }

  async function poll(){
    clearTimeout(timer);
    const matchId=selectedMatchId();
    if(!matchId){if(currentMatchId)reset(null);timer=setTimeout(poll,1200);return;}
    if(currentMatchId!==matchId)reset(matchId);
    try{
      runtime=runtime||await fetch(`./runtime.json?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json());
      const response=await fetch(animationUrl(matchId),{cache:'no-store'});
      const payload=await response.json();
      if(response.ok&&payload?.ok&&String(payload.matchId)===matchId){ingest(payload,matchId);}
      else if(Date.now()-lastSourceOk>6000)setSourceActive(false);
    }catch(error){
      if(Date.now()-lastSourceOk>6000)setSourceActive(false);
      console.warn('CAR 3.5 source animation unavailable',error);
    }
    timer=setTimeout(poll,pollMs);
  }

  window.addEventListener('resize',()=>setBall(ball.x,ball.y,ball));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  ensureUi();setTimeout(poll,350);
})();
