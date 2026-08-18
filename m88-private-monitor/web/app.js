const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const SETTINGS_KEY='m88-monitor-settings-v1';
const SIGNALS_KEY='m88-monitor-signals-v1';
const DEFAULTS={enabled:true,minuteMin:1,minuteMax:90,minOdds:1.01,maxOdds:20,minTotalGoals:0,maxTotalGoals:20,marketText:'',leagueInclude:'',leagueExclude:'',scanSeconds:15,cooldownMinutes:20,maxSignalsPerDay:20,requireLive:true};

function loadSettings(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {...DEFAULTS}}}
function saveSettings(v){localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));return v}
function loadSignals(){try{return JSON.parse(localStorage.getItem(SIGNALS_KEY)||'[]')}catch{return []}}
function saveSignals(v){localStorage.setItem(SIGNALS_KEY,JSON.stringify(v.slice(0,3000)));return v}
function fmt(n,d=2){return Number.isFinite(Number(n))?Number(n).toFixed(d):'—'}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function nowLocal(){return new Date().toLocaleString()}
function toast(msg){const old=$('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),2800)}

async function api(path, options={}){
  const token=sessionStorage.getItem('m88-private-token')||'';
  const headers={...(options.headers||{})};
  if(token)headers['x-private-token']=token;
  const r=await fetch(path,{cache:'no-store',...options,headers});
  if(r.status===401){const value=prompt('Private token');if(value){sessionStorage.setItem('m88-private-token',value);return api(path,options)}}
  const data=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`}));
  if(!r.ok&&data.error)throw new Error(data.error);
  return data;
}

function statusText(match){return String(match.status||'').toLowerCase()}
function isLive(match){const s=statusText(match);return !/(finished|final|ft|ended|cancel|postpon)/.test(s)}
function textList(s){return String(s||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)}
function passesRules(m,settings){
  if(!settings.enabled)return {state:'PASS',reason:'engine disabled'};
  const minute=Number(m.minute);
  if(Number.isFinite(minute)&&(minute<Number(settings.minuteMin)||minute>Number(settings.minuteMax)))return {state:'PASS',reason:'minute'};
  if(settings.requireLive&&!isLive(m))return {state:'PASS',reason:'not live'};
  const odds=Number(m.odds);
  if(Number.isFinite(odds)&&(odds<Number(settings.minOdds)||odds>Number(settings.maxOdds)))return {state:'PASS',reason:'odds'};
  const goals=Number(m.homeScore)+Number(m.awayScore);
  if(Number.isFinite(goals)&&(goals<Number(settings.minTotalGoals)||goals>Number(settings.maxTotalGoals)))return {state:'PASS',reason:'goals'};
  const marketNeed=String(settings.marketText||'').trim().toLowerCase();
  if(marketNeed&&!String(m.market||'').toLowerCase().includes(marketNeed))return {state:'PASS',reason:'market'};
  const league=String(m.league||'').toLowerCase();
  const includes=textList(settings.leagueInclude);if(includes.length&&!includes.some(x=>league.includes(x)))return {state:'PASS',reason:'league include'};
  const excludes=textList(settings.leagueExclude);if(excludes.some(x=>league.includes(x)))return {state:'PASS',reason:'league exclude'};
  if(!m.home||!m.away)return {state:'WATCH',reason:'missing teams'};
  if(!Number.isFinite(odds))return {state:'WATCH',reason:'missing odds'};
  return {state:'PICK',reason:'rules matched'};
}

function signalFingerprint(m){return [m.sourceId,m.market,m.selection,m.home,m.away].join('|')}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function maybeRecordSignal(m,decision,settings){
  if(decision.state!=='PICK')return false;
  const signals=loadSignals();const fp=signalFingerprint(m);const now=Date.now();
  const recent=signals.find(s=>s.fingerprint===fp&&now-new Date(s.detectedAt).getTime()<Number(settings.cooldownMinutes)*60000);
  if(recent)return false;
  const today=signals.filter(s=>String(s.detectedAt||'').slice(0,10)===new Date().toISOString().slice(0,10));
  if(today.length>=Number(settings.maxSignalsPerDay))return false;
  signals.unshift({id:crypto.randomUUID?.()||`${now}-${Math.random()}`,fingerprint:fp,detectedAt:new Date().toISOString(),detectedLocal:nowLocal(),result:'PENDING',ftScore:'',...m,rawSnapshot:m.raw});
  saveSignals(signals);return true;
}

async function initDetection(){
  const tbody=$('#matchRows'), feedState=$('#feedState'), lastScan=$('#lastScan'), picks=$('#pickCount'), total=$('#matchCount'), avgOdds=$('#avgOdds'), sourceStatus=$('#sourceStatus');
  let timer=null;let working=false;
  async function scan(){
    if(working)return;working=true;$('#scanBtn').disabled=true;feedState.textContent='Scanning M88…';
    try{
      const data=await api('/api/feed');
      lastScan.textContent=new Date(data.checkedAt||Date.now()).toLocaleTimeString();sourceStatus.textContent=data.mode||'—';
      const settings=loadSettings();const matches=data.matches||[];let pickN=0;let oddsSum=0;let oddsN=0;let newSignals=0;
      const rows=matches.map(m=>{const d=passesRules(m,settings);if(d.state==='PICK'){pickN++;if(Number.isFinite(Number(m.odds))){oddsSum+=Number(m.odds);oddsN++}if(maybeRecordSignal(m,d,settings))newSignals++}
        return `<tr><td>${esc(m.league||'—')}</td><td><b>${esc(m.home)}</b> vs ${esc(m.away)}</td><td>${esc(m.minute??'—')}′</td><td class="score">${esc(m.homeScore??'—')}–${esc(m.awayScore??'—')}</td><td>${esc(m.market||'—')}</td><td>${esc(m.selection||'—')}</td><td class="odds">${fmt(m.odds)}</td><td><span class="badge ${d.state.toLowerCase()}">${d.state}</span></td><td class="muted">${esc(d.reason)}</td></tr>`}).join('');
      tbody.innerHTML=rows||`<tr><td colspan="9"><div class="empty">${esc(data.message||'No public-feed matches returned yet.')}</div></td></tr>`;
      total.textContent=matches.length;picks.textContent=pickN;avgOdds.textContent=oddsN?fmt(oddsSum/oddsN):'—';feedState.textContent=data.ok?'M88 public feed online':(data.mode==='probe-required'?'Feed discovery required':'Feed unavailable');
      if(newSignals)toast(`${newSignals} new signal${newSignals>1?'s':''} recorded`);
    }catch(e){feedState.textContent='Source error';tbody.innerHTML=`<tr><td colspan="9"><div class="empty bad">${esc(e.message)}</div></td></tr>`}finally{working=false;$('#scanBtn').disabled=false}}
  $('#scanBtn').addEventListener('click',scan);$('#probeBtn').addEventListener('click',async()=>{const box=$('#probeOutput');box.textContent='Deep probing public M88 app…';try{const d=await api('/api/source/probe?deep=1');box.textContent=JSON.stringify(d,null,2)}catch(e){box.textContent=e.message}});
  function arm(){clearInterval(timer);const sec=Math.max(5,Number(loadSettings().scanSeconds)||15);timer=setInterval(scan,sec*1000);$('#intervalValue').textContent=`${sec}s`}
  arm();scan();window.addEventListener('storage',arm);
}

function initStatistics(){
  const signals=loadSignals();const settled=signals.filter(s=>['WIN','LOSS','DRAW','PUSH'].includes(String(s.result).toUpperCase()));const wins=settled.filter(s=>String(s.result).toUpperCase()==='WIN').length;const losses=settled.filter(s=>String(s.result).toUpperCase()==='LOSS').length;const odds=signals.map(s=>Number(s.odds)).filter(Number.isFinite);
  $('#statTotal').textContent=signals.length;$('#statWins').textContent=wins;$('#statLosses').textContent=losses;$('#statPending').textContent=signals.filter(s=>String(s.result).toUpperCase()==='PENDING').length;$('#statWinRate').textContent=settled.length?`${fmt(wins/settled.length*100,1)}%`:'—';$('#statAvgOdds').textContent=odds.length?fmt(odds.reduce((a,b)=>a+b,0)/odds.length):'—';
  $('#signalRows').innerHTML=signals.map(s=>`<tr data-id="${esc(s.id)}"><td>${esc(new Date(s.detectedAt).toLocaleString())}</td><td>${esc(s.league||'—')}</td><td><b>${esc(s.home)}</b> vs ${esc(s.away)}</td><td>${esc(s.minute??'—')}′</td><td class="score">${esc(s.homeScore??'—')}–${esc(s.awayScore??'—')}</td><td>${esc(s.ftScore||'—')}</td><td>${esc(s.market||'—')}</td><td>${esc(s.selection||'—')}</td><td class="odds">${fmt(s.odds)}</td><td><select class="result-select"><option ${s.result==='PENDING'?'selected':''}>PENDING</option><option ${s.result==='WIN'?'selected':''}>WIN</option><option ${s.result==='LOSS'?'selected':''}>LOSS</option><option ${s.result==='DRAW'?'selected':''}>DRAW</option><option ${s.result==='PUSH'?'selected':''}>PUSH</option></select></td><td><input class="ft-input" value="${esc(s.ftScore||'')}" placeholder="4-0"></td><td><button class="btn raw-btn">Raw</button></td></tr>`).join('')||`<tr><td colspan="12"><div class="empty">No signals recorded yet.</div></td></tr>`;
  $$('.result-select').forEach(el=>el.addEventListener('change',saveRow));$$('.ft-input').forEach(el=>el.addEventListener('change',saveRow));$$('.raw-btn').forEach(el=>el.addEventListener('click',e=>{const row=e.target.closest('tr'),s=loadSignals().find(x=>x.id===row.dataset.id);alert(JSON.stringify(s?.rawSnapshot||{},null,2))}));
  function saveRow(e){const row=e.target.closest('tr'),items=loadSignals(),s=items.find(x=>x.id===row.dataset.id);if(!s)return;s.result=$('.result-select',row).value;s.ftScore=$('.ft-input',row).value.trim();saveSignals(items);toast('Statistics record updated')}
  $('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(loadSignals(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`m88-signals-${todayKey()}.json`;a.click();URL.revokeObjectURL(a.href)});
  $('#clearBtn').addEventListener('click',()=>{if(confirm('Clear all local M88 signal history on this browser?')){localStorage.removeItem(SIGNALS_KEY);location.reload()}})
}

function initSettings(){
  const s=loadSettings();for(const [k,v] of Object.entries(s)){const el=$(`[name="${k}"]`);if(!el)continue;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v}
  $('#settingsForm').addEventListener('submit',e=>{e.preventDefault();const next={};new FormData(e.currentTarget).forEach((v,k)=>next[k]=v);for(const el of $$('input[type=checkbox]',e.currentTarget))next[el.name]=el.checked;for(const k of ['minuteMin','minuteMax','minOdds','maxOdds','minTotalGoals','maxTotalGoals','scanSeconds','cooldownMinutes','maxSignalsPerDay'])next[k]=Number(next[k]);saveSettings({...DEFAULTS,...next});toast('Conditions saved on this device')});
  $('#resetSettings').addEventListener('click',()=>{saveSettings({...DEFAULTS});location.reload()});
  $('#healthBtn').addEventListener('click',async()=>{const box=$('#healthOutput');box.textContent='Checking…';try{box.textContent=JSON.stringify(await api('/api/health'),null,2)}catch(e){box.textContent=e.message}})
}

const page=document.body.dataset.page;if(page==='detection')initDetection();if(page==='statistics')initStatistics();if(page==='settings')initSettings();
