(()=>{
  const API=window.NOMAD_RUNTIME?.engineUrl;
  const byId=id=>document.getElementById(id);
  const set=(id,value)=>{const node=byId(id);if(node)node.textContent=value??'—';};
  const fmtTime=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString();};
  const statusClass=ok=>ok?'win':'loss';
  const sourceStatus=value=>{
    if(value==null)return '—';
    if(typeof value==='string')return value;
    if(typeof value==='boolean')return value?'READY':'OFF';
    if(typeof value==='object')return value.status||value.state||(value.ready===true?'READY':value.ready===false?'OFF':'—');
    return String(value);
  };
  const renderSources=source=>{
    const root=byId('sourceHealth');
    if(!root)return;
    const entries=Object.entries(source||{});
    root.innerHTML=entries.length?entries.map(([name,value])=>`<div><span>${String(name).replace(/[&<>]/g,'')}</span><strong>${String(sourceStatus(value)).replace(/[&<>]/g,'')}</strong></div>`).join(''):'<div><span>Sources</span><strong>—</strong></div>';
  };
  const load=async()=>{
    if(!API){set('healthState','CONFIG ERROR');set('healthNote','Runtime engine URL unavailable.');return;}
    set('healthEnvironment',String(window.NOMAD_RUNTIME?.environment||'unknown').toUpperCase());
    try{
      const response=await fetch(`${API}/health?_=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      const ok=data?.ok!==false&&!data?.lastError;
      const state=byId('healthState');
      if(state){state.textContent=ok?'READY':'ATTENTION';state.className=statusClass(ok);}
      set('healthCycle',data?.cycle??data?.cycleCount??'—');
      set('healthLastSuccess',fmtTime(data?.lastSuccess||data?.updatedAt));
      set('healthLastCycle',fmtTime(data?.lastCycle));
      set('healthMatches',data?.liveMatches??data?.matches??data?.counts?.live??'—');
      set('healthSignals',data?.signals??data?.counts?.signal??data?.signalCount??'—');
      set('healthConfig',data?.configVersion??data?.activeConfigVersion??data?.config?.version??'—');
      set('healthError',data?.lastError||'None');
      set('healthNote',`Connected to ${window.NOMAD_RUNTIME?.environment||'runtime'} engine.`);
      renderSources(data?.source||data?.sources||{});
    }catch(error){
      const state=byId('healthState');if(state){state.textContent='OFFLINE';state.className='loss';}
      set('healthError',error.message);
      set('healthNote','Health endpoint is temporarily unavailable.');
    }
  };
  load();
  setInterval(load,15000);
})();
