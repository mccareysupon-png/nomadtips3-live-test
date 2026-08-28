(()=>{
  const ENGINE=window.NOMAD_RUNTIME?.engineBase;
  const ENV=window.NOMAD_RUNTIME?.environment||'unknown';
  const form=document.getElementById('settingsForm');
  const saveStatus=document.getElementById('saveStatus');
  if(!ENGINE||!form||!saveStatus)return;

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const key=()=>sessionStorage.getItem(`nomadSettingsKey:${ENV}`)||'';
  const panel=document.createElement('section');
  panel.className='panel setting-section match-scouts-settings';
  panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">SIDE CAR · MATCH SCOUTS</p><h2>Condition boxes</h2></div><span class="match-scouts-state">CONNECTING</span></div>
    <div class="match-scouts-controls"><div class="field"><label for="matchScoutName">Condition / Match Scout Name</label><input id="matchScoutName" maxlength="80" value="K-HomEX" autocomplete="off"><small>Name is registered only after the saved config version becomes ACTIVE. Leave blank for a normal core-only save.</small></div><button type="button" class="match-scouts-detach">EMERGENCY DETACH</button></div>
    <div class="match-scouts-message">Connecting sidecar registry…</div><div class="match-scouts-list"></div>`;
  form.parentNode.insertBefore(panel,form);

  const style=document.createElement('style');
  style.textContent=`.match-scouts-settings .panel-head{align-items:center}.match-scouts-state{font-size:9px;font-weight:900;letter-spacing:.08em;color:#f2d21b}.match-scouts-state.ok{color:#83df89}.match-scouts-state.off{color:#ffb36b}.match-scouts-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}.match-scouts-controls .field input{width:100%;background:#121612;border:1px solid rgba(150,158,151,.18);color:#f2f4ef;border-radius:9px;padding:11px}.match-scouts-detach{border:0;border-radius:9px;padding:11px 14px;background:#542c2c;color:#fff;font-weight:900;cursor:pointer;min-height:40px}.match-scouts-detach.attach{background:#263027}.match-scouts-message{font-size:9px;color:#98a091;margin:9px 0}.match-scouts-list{display:grid;gap:6px}.match-scout-row{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;background:rgba(255,255,255,.025);border-radius:8px;padding:9px}.match-scout-row b{font-size:10px}.match-scout-row span,.match-scout-row small{font-size:8px;color:#899289}.match-scout-seq{font-weight:900;color:#f2d21b!important}@media(max-width:700px){.match-scouts-controls{grid-template-columns:1fr}.match-scout-row{grid-template-columns:auto 1fr}.match-scout-row small{grid-column:2}}`;
  document.head.appendChild(style);

  const stateEl=panel.querySelector('.match-scouts-state');
  const messageEl=panel.querySelector('.match-scouts-message');
  const listEl=panel.querySelector('.match-scouts-list');
  const nameEl=panel.querySelector('#matchScoutName');
  const detachButton=panel.querySelector('.match-scouts-detach');
  let registry=null;
  let pendingName=null;
  let registering=false;

  const render=()=>{
    if(!registry){stateEl.textContent='UNAVAILABLE';stateEl.className='match-scouts-state off';detachButton.disabled=true;return;}
    stateEl.textContent=registry.enabled?'CONNECTED':'DETACHED';
    stateEl.className=`match-scouts-state ${registry.enabled?'ok':'off'}`;
    detachButton.disabled=false;
    detachButton.textContent=registry.enabled?'EMERGENCY DETACH':'ATTACH SIDECAR';
    detachButton.classList.toggle('attach',!registry.enabled);
    const scouts=Array.isArray(registry.scouts)?registry.scouts:[];
    listEl.innerHTML=scouts.length?scouts.map(scout=>`<div class="match-scout-row"><span class="match-scout-seq">#${String(scout.sequence).padStart(3,'0')}</span><b>${esc(scout.name)}</b><small>${esc(scout.scoutId)} · CONFIG v${Number(scout.configVersion)||'—'}</small></div>`).join(''):'<div class="note">No named condition boxes yet. The first successful named Save & Run becomes #001.</div>';
  };

  const load=async()=>{
    try{
      const response=await fetch(`${ENGINE}/match-scouts?_=${Date.now()}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
      registry=data;render();
      messageEl.textContent=registry.enabled?`Sidecar ready · active core config v${registry.activeConfigVersion??'—'}. Core Engine remains independent.`:'Sidecar detached · Core Engine, signals and overall statistics continue normally.';
    }catch(error){registry=null;render();messageEl.textContent=`Sidecar unavailable · Core Engine is untouched (${error.message}).`;}
  };

  const register=async(version,name)=>{
    if(registering)return;
    registering=true;
    messageEl.textContent=`Core v${version} is ACTIVE · filing ${name} into the sidecar…`;
    try{
      const response=await fetch(`${ENGINE}/match-scouts/register`,{method:'POST',headers:{'content-type':'application/json','x-settings-key':key()},body:JSON.stringify({name,configVersion:Number(version)})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
      messageEl.textContent=data.created?`${data.scout.scoutId} · ${data.scout.name} filed safely at config v${data.scout.configVersion}.`:`Config v${data.scout.configVersion} was already filed as ${data.scout.scoutId}; no duplicate box created.`;
      nameEl.value='';
      await load();
    }catch(error){messageEl.textContent=`Core v${version} remains ACTIVE. Sidecar filing failed only: ${error.message}`;}
    finally{registering=false;}
  };

  form.addEventListener('submit',()=>{
    const name=nameEl.value.trim();
    pendingName=registry?.enabled&&name?name:null;
    if(!name)messageEl.textContent='No Match Scout name · saving Core Settings only.';
    else if(registry?.enabled===false)messageEl.textContent='Sidecar is detached · Core Settings will save normally without creating a box.';
  },true);

  const observer=new MutationObserver(()=>{
    const text=saveStatus.textContent||'';
    if(/Save failed|Fix the highlighted fields|Load failed/i.test(text)){pendingName=null;return;}
    const active=text.match(/Version\s+(\d+)\s+is ACTIVE/i);
    if(active&&pendingName){const name=pendingName;pendingName=null;register(Number(active[1]),name);}
  });
  observer.observe(saveStatus,{childList:true,characterData:true,subtree:true});

  detachButton.addEventListener('click',async()=>{
    if(!registry)return;
    detachButton.disabled=true;
    const action=registry.enabled?'detach':'attach';
    messageEl.textContent=registry.enabled?'Detaching sidecar now · Core Engine keeps running…':'Attaching sidecar registry…';
    try{
      const response=await fetch(`${ENGINE}/match-scouts/${action}`,{method:'POST',headers:{'x-settings-key':key()}});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
      registry=data;render();
      messageEl.textContent=registry.enabled?'Sidecar connected. Existing boxes and sequence are intact.':'SIDE CAR DETACHED · Core Engine, Signal Lock, Settlement and overall Statistics are still running.';
    }catch(error){messageEl.textContent=`Detach control failed without touching Core Engine: ${error.message}`;detachButton.disabled=false;}
  });

  load();
})();
