(()=>{
  'use strict';

  const runtime=window.NOMAD_RUNTIME||{};
  const env=String(runtime.environment||'unknown');
  const STORAGE_KEY=`nomad341:match-scouts:${env}:registry:v1`;
  const DETACH_KEY=`nomad341:match-scouts:${env}:detached:v1`;
  const MAX_NAME=64;
  const EVENT='nomad:match-scouts-updated';
  const detached=()=>safeGet(DETACH_KEY)==='1';

  function safeGet(key){try{return localStorage.getItem(key);}catch{return null;}}
  function safeSet(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));}
  function readRegistry(){
    try{
      const parsed=JSON.parse(safeGet(STORAGE_KEY)||'[]');
      if(!Array.isArray(parsed))return [];
      return parsed.filter(item=>item&&Number.isFinite(Number(item.sequence))&&Number.isFinite(Number(item.configVersion)));
    }catch{return [];}
  }
  function writeRegistry(items){return safeSet(STORAGE_KEY,JSON.stringify(items));}
  function emit(){try{window.dispatchEvent(new CustomEvent(EVENT));}catch{}}
  function list(){return readRegistry().slice().sort((a,b)=>Number(a.sequence)-Number(b.sequence));}
  function findByVersion(version){const target=Number(version);return list().find(item=>Number(item.configVersion)===target)||null;}
  function normalizeName(name){return String(name||'').trim().replace(/\s+/g,' ').slice(0,MAX_NAME);}
  function registerActive(input={}){
    if(detached())return {ok:false,detached:true};
    const name=normalizeName(input.name);
    const configVersion=Number(input.configVersion);
    if(!name||!Number.isFinite(configVersion))return {ok:false,error:'invalid_registration'};
    const items=list();
    const existing=items.find(item=>Number(item.configVersion)===configVersion);
    if(existing)return {ok:true,item:existing,existing:true};
    const sequence=items.reduce((max,item)=>Math.max(max,Number(item.sequence)||0),0)+1;
    const item={
      scoutId:`MS-${String(sequence).padStart(4,'0')}`,
      sequence,
      name,
      configVersion,
      appliesFromCycle:Number.isFinite(Number(input.appliesFromCycle))?Number(input.appliesFromCycle):null,
      createdAt:input.createdAt||new Date().toISOString(),
      settingsSnapshot:input.settingsSnapshot&&typeof input.settingsSnapshot==='object'?input.settingsSnapshot:null,
    };
    if(!writeRegistry([...items,item]))return {ok:false,error:'storage_unavailable'};
    emit();
    return {ok:true,item,existing:false};
  }
  function detach(){const ok=safeSet(DETACH_KEY,'1');emit();return ok;}
  function attach(){let ok=false;try{localStorage.removeItem(DETACH_KEY);ok=true;}catch{}emit();return ok;}

  window.NOMAD_MATCH_SCOUTS=Object.freeze({list,findByVersion,registerActive,isDetached:detached,detach,attach});

  function installStyle(){
    if(document.getElementById('matchScoutSidecarStyle'))return;
    const style=document.createElement('style');
    style.id='matchScoutSidecarStyle';
    style.textContent=`
      .ms-sidecar{position:relative}.ms-sidecar-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.ms-sidecar-state{display:inline-flex;align-items:center;gap:6px;font-size:9px;font-weight:900;letter-spacing:.04em}.ms-sidecar-dot{width:7px;height:7px;border-radius:50%;background:#83df89;box-shadow:0 0 0 3px rgba(131,223,137,.12)}.ms-sidecar.is-detached .ms-sidecar-dot{background:#f2d21b;box-shadow:none}.ms-sidecar-control{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ms-sidecar button{border:0;border-radius:8px;padding:9px 11px;font-weight:900;cursor:pointer}.ms-detach{background:#542c2c;color:#fff}.ms-attach{background:#f2d21b;color:#10120f}.ms-name-wrap{margin-top:10px}.ms-name-wrap label{display:block;font-size:9px;font-weight:900;color:#a7afa7;margin-bottom:5px}.ms-name-wrap input{width:100%;background:#121612;border:1px solid rgba(150,158,151,.18);color:#f2f4ef;border-radius:9px;padding:11px;outline:none}.ms-help,.ms-warning{font-size:8px;line-height:1.45;color:#899289;margin-top:5px}.ms-warning{color:#f2d21b}.ms-boxes{display:grid;gap:6px;margin-top:10px}.ms-box{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;background:rgba(255,255,255,.025);border-radius:8px;padding:8px}.ms-box-id{font-size:8px;color:#899289}.ms-box-name{font-size:10px;font-weight:900}.ms-box-meta{font-size:8px;color:#899289;text-align:right}.ms-empty{font-size:9px;color:#899289;padding:8px 0}.ms-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:10px}.ms-card{background:rgba(255,255,255,.025);border-radius:10px;padding:11px}.ms-card-top{display:flex;justify-content:space-between;gap:8px;align-items:start}.ms-card h3{font-size:12px;margin:2px 0}.ms-card small{font-size:8px;color:#899289}.ms-card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:9px}.ms-stat{background:rgba(0,0,0,.12);border-radius:7px;padding:7px}.ms-stat span{display:block;font-size:7px;color:#899289;text-transform:uppercase}.ms-stat b{display:block;font-size:10px;margin-top:2px}.ms-positive{color:#83df89}.ms-negative{color:#ff8b8b}@media(max-width:700px){.ms-box{grid-template-columns:1fr}.ms-box-meta{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function currentSettingsSnapshot(){
    const ids=['minuteFrom','minuteTo','rollingWindowMinutes','maxScoreDifference','attackWeight','dangerousAttackWeight','homePressureShareMinimum','trendConditionsRequired','sotDeltaMinimum','shotOffEvidenceEnabled','cornerDeltaMinimum','evidenceMode','allowedLinesMode','oddsMinimum','oddsMaximum','maximumPriceAgeSeconds'];
    const checks=['scoreDifferenceFilterEnabled','homeEventRequired','sotEvidenceEnabled','shotOffEvidenceEnabled','cornerEvidenceEnabled','oddsMaximumEnabled','oneSignalPerMatch'];
    const snapshot={};
    for(const id of ids){const el=document.getElementById(id);if(el)snapshot[id]=el.type==='number'?Number(el.value):el.value;}
    for(const id of checks){const el=document.getElementById(id);if(el)snapshot[id]=Boolean(el.checked);}
    const lines=document.getElementById('allowedSelectionLines');
    if(lines)snapshot.allowedSelectionLines=[...lines.selectedOptions].map(option=>Number(option.value));
    snapshot.market='Full Match Live AH';snapshot.side='HOME';snapshot.bookmaker='Bet365 via TotalCorner';
    return snapshot;
  }

  function installSettings(){
    const form=document.getElementById('settingsForm');
    const validation=document.getElementById('validationMessages');
    const saveStatus=document.getElementById('saveStatus');
    if(!form||!validation||!saveStatus)return;

    const section=document.createElement('section');
    section.className='panel setting-section ms-sidecar';
    section.id='matchScoutSidecar';
    section.innerHTML=`<div class="ms-sidecar-head"><div><p class="eyebrow">SIDECAR REGISTRY</p><h2>Match Scouts</h2></div><div class="ms-sidecar-control"><span class="ms-sidecar-state"><i class="ms-sidecar-dot"></i><span class="ms-state-text"></span></span><button type="button" class="ms-detach"></button></div></div><div class="ms-name-wrap"><label for="matchScoutName">Condition Name (optional)</label><input id="matchScoutName" maxlength="${MAX_NAME}" autocomplete="off" placeholder="e.g. K-HomEX"><div class="ms-help">Leave blank to Save & Run normally. Enter a name to file the next successfully ACTIVE config as a Match Scout.</div><div class="ms-warning" hidden></div></div><div class="ms-boxes"></div>`;
    form.insertBefore(section,validation);
    const nameInput=section.querySelector('#matchScoutName');
    const button=section.querySelector('button');
    const warning=section.querySelector('.ms-warning');
    let pending=null;

    const render=()=>{
      const off=detached();
      section.classList.toggle('is-detached',off);
      section.querySelector('.ms-state-text').textContent=off?'MATCH SCOUTS · DETACHED':'MATCH SCOUTS · CONNECTED';
      button.className=off?'ms-attach':'ms-detach';
      button.textContent=off?'RECONNECT':'EMERGENCY DETACH';
      nameInput.disabled=off;
      const items=list().slice().reverse();
      section.querySelector('.ms-boxes').innerHTML=items.length?items.map(item=>`<div class="ms-box"><span class="ms-box-id">${esc(item.scoutId)}</span><span class="ms-box-name">${esc(item.name)}</span><span class="ms-box-meta">CONFIG v${esc(item.configVersion)}${item.appliesFromCycle!=null?` · CYCLE ${esc(item.appliesFromCycle)}`:''}</span></div>`).join(''):'<div class="ms-empty">No named Match Scouts yet. Core Settings runs normally.</div>';
    };

    button.addEventListener('click',()=>{warning.hidden=true;if(detached())attach();else detach();render();});
    form.addEventListener('submit',()=>{
      const name=normalizeName(nameInput.value);
      pending=!detached()&&name?{name,settingsSnapshot:currentSettingsSnapshot()}:null;
      warning.hidden=true;
    },true);

    const observer=new MutationObserver(()=>{
      const text=String(saveStatus.textContent||'');
      if(/Save failed|Fix the highlighted fields/i.test(text)){pending=null;return;}
      const match=text.match(/Version\s+(\d+)\s+is ACTIVE/i);
      if(!match||!pending)return;
      const configVersion=Number(match[1]);
      const cycleText=String(document.getElementById('activeCycle')?.textContent||'');
      const cycleMatch=cycleText.match(/(\d+)/);
      const result=registerActive({...pending,configVersion,appliesFromCycle:cycleMatch?Number(cycleMatch[1]):null});
      pending=null;
      if(result.ok){nameInput.value='';warning.textContent=`Filed ${result.item.scoutId} · ${result.item.name} · config v${result.item.configVersion}`;warning.hidden=false;}
      else if(!result.detached){warning.textContent='Core config is ACTIVE, but the Match Scout sidecar could not file this name. Core engine was not affected.';warning.hidden=false;}
      render();
    });
    observer.observe(saveStatus,{childList:true,subtree:true,characterData:true});
    window.addEventListener(EVENT,render);
    render();
  }

  function summarize(records){
    const settled=records.filter(item=>item?.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    const profit=settled.reduce((total,item)=>total+(Number(item.settlement?.profit)||0),0);
    const avgOdds=records.length?records.reduce((total,item)=>total+(Number(item?.odds)||0),0)/records.length:0;
    return {signals:records.length,settled,wins,losses,pushes,profit,avgOdds,winRate:settled.length?wins/settled.length*100:0,roi:settled.length?profit/settled.length*100:0};
  }

  function installStatistics(){
    const main=document.querySelector('main');
    if(!main)return;
    const note=main.querySelector(':scope > .note');
    const section=document.createElement('section');
    section.className='panel ms-sidecar';
    section.id='matchScoutStatistics';
    section.innerHTML=`<div class="panel-head ms-sidecar-head"><div><p class="eyebrow">CONDITION ARCHIVE</p><h2>Match Scouts</h2></div><div class="ms-sidecar-control"><span class="ms-sidecar-state"><i class="ms-sidecar-dot"></i><span class="ms-state-text"></span></span></div></div><div class="ms-warning" hidden></div><div class="ms-cards"></div>`;
    if(note)main.insertBefore(section,note);else main.appendChild(section);
    let records=[];

    const render=()=>{
      const off=detached();
      section.classList.toggle('is-detached',off);
      section.querySelector('.ms-state-text').textContent=off?'MATCH SCOUTS · DETACHED':'MATCH SCOUTS · CONNECTED';
      const warning=section.querySelector('.ms-warning');
      const cards=section.querySelector('.ms-cards');
      if(off){warning.textContent='Sidecar detached. Overall statistics above remain active and unchanged.';warning.hidden=false;cards.innerHTML='';return;}
      warning.hidden=true;
      const items=list();
      if(!items.length){cards.innerHTML='<div class="ms-empty">No named Match Scouts yet. Overall statistics remain unchanged.</div>';return;}
      cards.innerHTML=items.map(item=>{
        const own=records.filter(record=>Number(record?.configSnapshot?.version)===Number(item.configVersion));
        const s=summarize(own);
        const profitClass=s.profit>0?'ms-positive':s.profit<0?'ms-negative':'';
        const roiClass=s.roi>0?'ms-positive':s.roi<0?'ms-negative':'';
        return `<article class="ms-card"><div class="ms-card-top"><div><small>${esc(item.scoutId)} · CONFIG v${esc(item.configVersion)}</small><h3>${esc(item.name)}</h3></div><small>${item.createdAt?esc(new Date(item.createdAt).toLocaleDateString()):''}</small></div><div class="ms-card-grid"><div class="ms-stat"><span>Signals</span><b>${s.signals}</b></div><div class="ms-stat"><span>W / L / P</span><b>${s.wins} / ${s.losses} / ${s.pushes}</b></div><div class="ms-stat"><span>Win Rate</span><b>${s.settled.length?s.winRate.toFixed(1)+'%':'—'}</b></div><div class="ms-stat"><span>Avg Odds</span><b>${s.signals?s.avgOdds.toFixed(2):'—'}</b></div><div class="ms-stat"><span>Profit</span><b class="${profitClass}">${s.settled.length?(s.profit>=0?'+':'')+s.profit.toFixed(2)+'u':'—'}</b></div><div class="ms-stat"><span>ROI</span><b class="${roiClass}">${s.settled.length?(s.roi>=0?'+':'')+s.roi.toFixed(1)+'%':'—'}</b></div></div></article>`;
      }).join('');
    };

    window.addEventListener('nomad:statistics-records',event=>{records=Array.isArray(event.detail?.records)?event.detail.records:[];render();});
    window.addEventListener(EVENT,render);
    render();
    const api=runtime.engineBase;
    if(api)fetch(`${api}/statistics`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data&&Array.isArray(data.records)){records=data.records;render();}}).catch(()=>{});
  }

  installStyle();
  const boot=()=>{try{installSettings();installStatistics();}catch(error){console.warn('Match Scouts sidecar detached after UI error',error);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
