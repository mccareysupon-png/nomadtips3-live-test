(() => {
  'use strict';
  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const PATH = '/production-live-config';
  const KEY = 'nomadtips3.car1.owner-key';
  const ids = ['engineEnabled','refreshSeconds','fixturesMax','minuteMin','minuteMax','minimumTotalGoals','goalGapLimited','maxGoalGap','countryFilter','leagueFilter','teamFilter','sortMode'];
  const $ = id => document.getElementById(id);
  let state = null;

  function ownerKey(){ return sessionStorage.getItem(KEY) || ''; }
  function text(value){ return String(value ?? '').trim(); }
  function configFromForm(){
    const minuteMin = Number($('minuteMin').value);
    const minuteMax = Number($('minuteMax').value);
    if (!Number.isFinite(minuteMin) || !Number.isFinite(minuteMax) || minuteMin >= minuteMax) throw new Error('นาทีเริ่มต้องน้อยกว่านาทีสิ้นสุด');
    return {
      engineEnabled: $('engineEnabled').value === 'true',
      refreshSeconds: Number($('refreshSeconds').value), fixturesMax: Number($('fixturesMax').value),
      minuteMin, minuteMax, minimumTotalGoals: Number($('minimumTotalGoals').value),
      goalGapLimited: $('goalGapLimited').value === 'true', maxGoalGap: Number($('maxGoalGap').value),
      countryFilter: text($('countryFilter').value), leagueFilter: text($('leagueFilter').value),
      teamFilter: text($('teamFilter').value), sortMode: $('sortMode').value
    };
  }
  function summary(c){
    if(!c) return '—';
    const filter=[c.countryFilter&&`ประเทศ: ${c.countryFilter}`,c.leagueFilter&&`ลีก: ${c.leagueFilter}`,c.teamFilter&&`ทีม: ${c.teamFilter}`].filter(Boolean).join(' · ')||'ทุกประเทศ · ทุกลีก · ทุกทีม';
    const gap=c.goalGapLimited?`ผลต่าง ≤ ${c.maxGoalGap}`:'ไม่จำกัดผลต่าง';
    return `${c.engineEnabled?'RUNNING':'PAUSED'} · รีเฟรช ${c.refreshSeconds} วินาที · สูงสุด ${c.fixturesMax} คู่ · นาที ${c.minuteMin}–${c.minuteMax} · ประตูรวม ≥ ${c.minimumTotalGoals} · ${gap} · ${filter}`;
  }
  function fill(c){
    if(!c)return;
    for(const id of ids){
      if($(id)) $(id).value = typeof c[id] === 'boolean' ? String(c[id]) : (c[id] ?? '');
    }
    updateGap(); updateDraft();
  }
  function updateGap(){ $('maxGoalGap').disabled=$('goalGapLimited').value!=='true'; }
  function updateDraft(){ try{$('draftSummary').textContent=summary(configFromForm());}catch(e){$('draftSummary').textContent=e.message;} }
  function message(value,good=false){$('message').textContent=value;$('message').className=`message ${good?'good':'bad'}`;}
  function busy(value){['reloadButton','defaultsButton','saveButton','activateButton'].forEach(id=>$(id).disabled=value);}
  async function api(method='GET',body=null){
    const response=await fetch(`${WORKER}${PATH}`,{method,cache:'no-store',headers:{'Content-Type':'application/json','X-NOMAD-OWNER-KEY':ownerKey()},body:body?JSON.stringify(body):undefined});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok)throw new Error(payload?.error||`HTTP ${response.status}`);
    return payload;
  }
  function render(payload){
    state=payload; fill(payload.draft||payload.active||payload.defaults);
    const active=payload.active;
    $('activeSummary').textContent=summary(active);
    $('engineBadge').textContent=active.engineEnabled?'RUNNING':'PAUSED';
    $('engineBadge').className=active.engineEnabled?'running':'paused';
    $('version').textContent=payload.version||'—';
    $('activatedAt').textContent=payload.activatedAt?new Date(payload.activatedAt).toLocaleString('th-TH'):'ยังไม่มีข้อมูล';
    $('refreshMetric').textContent=`${active.refreshSeconds}s`;
    $('fixturesMetric').textContent=active.fixturesMax;
    $('dashboard').hidden=false; $('loginPanel').hidden=true;
  }
  async function load(){
    try{busy(true);render(await api());message('เชื่อมต่อรถคันที่ 1 แล้ว',true);}catch(e){$('dashboard').hidden=true;$('loginPanel').hidden=false;sessionStorage.removeItem(KEY);alert(`เชื่อมต่อไม่ได้: ${e.message}`);}finally{busy(false);}
  }
  async function submit(action){
    try{const config=configFromForm();busy(true);message(action==='activate'?'กำลังยืนยันค่า Production…':'กำลังเซฟร่าง…',true);if(action==='activate'&&!confirm('ยืนยันใช้ค่าชุดนี้กับรถคันที่ 1 และหน้า /live ?'))return;render(await api('POST',{action,config}));message(action==='activate'?'รถคันที่ 1 ใช้ค่าใหม่แล้ว':'เซฟร่างแล้ว หน้า Live ยังใช้ค่าเดิม',true);}catch(e){message(e.message,false);}finally{busy(false);}
  }
  $('loginForm').addEventListener('submit',e=>{e.preventDefault();sessionStorage.setItem(KEY,$('ownerKey').value);load();});
  ids.forEach(id=>$(id).addEventListener('input',updateDraft));
  $('goalGapLimited').addEventListener('change',()=>{updateGap();updateDraft();});
  $('reloadButton').addEventListener('click',load);
  $('defaultsButton').addEventListener('click',()=>{fill(state?.defaults);message('ใส่ค่าตั้งต้นในช่องแล้ว ยังไม่กระทบหน้า Live',true);});
  $('saveButton').addEventListener('click',()=>submit('save'));
  $('activateButton').addEventListener('click',()=>submit('activate'));
  if(ownerKey())load();
})();
