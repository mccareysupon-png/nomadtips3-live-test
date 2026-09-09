(()=>{
  const KEY='nomad343SettingsV1';
  const RUN_KEY='nomad343RunStateV1';
  const defaults={
    over:{lineMin:0.5,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
    under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
    oneXtwo:{sideMode:'BOTH',scoreTrailingMax:0,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
    ah:{sideMode:'BOTH',lineMin:-10,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5}
  };
  const safeParse=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
  const state={...defaults,...safeParse(localStorage.getItem(KEY),{})};
  const run={over:false,under:false,oneXtwo:false,ah:false,...safeParse(localStorage.getItem(RUN_KEY),{})};
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  function setField(form,name,value){
    const els=form.querySelectorAll(`[name="${name}"]`); if(!els.length)return;
    if(els[0].type==='radio') els.forEach(el=>el.checked=el.value===String(value));
    else els[0].value=value;
  }
  function fill(market){const form=document.querySelector(`[data-form="${market}"]`); if(!form)return; Object.entries(state[market]||{}).forEach(([k,v])=>setField(form,k,v));}
  function read(form){
    const out={};
    new FormData(form).forEach((v,k)=>{out[k]=['sideMode'].includes(k)?v:num(v)});
    return out;
  }
  function saveAll(){localStorage.setItem(KEY,JSON.stringify(state));}
  function saveRun(){localStorage.setItem(RUN_KEY,JSON.stringify(run));}
  function updateRunUI(market){
    const panel=document.querySelector(`[data-panel="${market}"]`); if(!panel)return;
    const dot=panel.querySelector('[data-run-dot]'), label=panel.querySelector('[data-run-label]'), btn=panel.querySelector('[data-run]');
    if(dot)dot.classList.toggle('on',!!run[market]); if(label)label.textContent=run[market]?'RUN':'STOP'; if(btn)btn.classList.toggle('is-on',!!run[market]);
  }
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    const market=btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    document.querySelectorAll('[data-panel]').forEach(p=>{const on=p.dataset.panel===market;p.hidden=!on;});
  }));
  document.querySelectorAll('[data-form]').forEach(form=>{
    const market=form.dataset.form; fill(market); updateRunUI(market);
    form.addEventListener('submit',e=>{e.preventDefault(); state[market]=read(form); saveAll(); const note=form.querySelector('[data-note]'); if(note)note.textContent='บันทึกค่าตั้งต้น 3.43 แล้ว';});
    form.querySelector('[data-run]')?.addEventListener('click',()=>{state[market]=read(form);saveAll();run[market]=true;saveRun();updateRunUI(market);const note=form.querySelector('[data-note]');if(note)note.textContent='RUN ถูกบันทึกไว้สำหรับเครื่อง 3.43';});
    form.querySelector('[data-stop]')?.addEventListener('click',()=>{run[market]=false;saveRun();updateRunUI(market);const note=form.querySelector('[data-note]');if(note)note.textContent='STOP ถูกบันทึกไว้สำหรับเครื่อง 3.43';});
  });
  window.NOMAD343_METRICS={
    count:['shotOnTarget','shotOff','corner'],
    rollingSharePct:['dangerousAttackPct','attackPct'],
    latestPct:['possessionPct'],
    rollingShare:(homeDelta,awayDelta)=>{const h=num(homeDelta),a=num(awayDelta),t=h+a;if(t<=0)return {home:null,away:null};const hp=h/t*100;return {home:hp,away:100-hp};},
    rollingDelta:(current,previous)=>{if(current==null||previous==null)return null;return Math.max(0,num(current)-num(previous));},
    normalizePossession:v=>{if(v==null||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;}
  };
})();