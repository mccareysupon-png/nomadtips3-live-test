const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return'—'}};
const fmtLine=v=>{const n=Number(v);return Number.isFinite(n)?`${n>0?'+':''}${n}`:'—'};
const fmtOdds=v=>{const n=Number(v);return Number.isFinite(n)?n.toFixed(2):'—'};
let runtime={workerUrl:'https://nomadtips3-car34-real-market-audit.mccarey-supon.workers.dev',refreshSeconds:15};
async function bootRuntime(){try{runtime={...runtime,...await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json())};}catch{}}
async function api(path,opts){const r=await fetch(`${runtime.workerUrl}${path}`,{cache:'no-store',...opts,headers:{'content-type':'application/json',...(opts?.headers||{})}});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`HTTP ${r.status}`);return p;}
function nav(page){document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===page));}
function resultClass(r){const x=String(r||'PENDING').toUpperCase();return x==='WIN'?'win':x==='LOSS'?'loss':x==='DRAW'?'draw':'pending'}
async function detector(){
  const [health,live,history]=await Promise.all([api('/health'),api('/live'),api('/history?page=1&limit=25')]);
  const pipe=health.realMarketPipe||live.realMarketPipe||{};
  $('#engine').textContent=health.lastError?'CHECK':'ONLINE';$('#engine').className=health.lastError?'bad':'good';
  $('#cycle').textContent=fmtTime(health.lastCycle);$('#marketState').textContent=pipe.status||'WAITING';$('#marketState').className=pipe.status==='OK'?'good':pipe.status==='KEY_MISSING'||pipe.status==='ERROR'?'bad':'warn';
  $('#matched').textContent=`${pipe.ahMatched??0}/${pipe.eligibleMatches??0}`;
  $('#sourceInfo').innerHTML=`<span class="pill">Price: ${esc(pipe.source||'1xbet')}</span><span class="pill">Market: AH only</span><span class="pill">Mapped: ${pipe.mappedMatches??0}</span><span class="pill">API key: ${pipe.keyConfigured?'ready':'missing'}</span>`;
  const records=history.records||[];
  $('#signals').innerHTML=records.length?records.slice(0,10).map(r=>`<div class="signal-card"><div><small>${esc(r.league||'')}</small><strong>${esc(r.home)} vs ${esc(r.away)}</strong><small>${fmtTime(r.selectedAt)} · score ${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</small></div><div><small>Pick</small><strong class="pick">${esc(r.selectedTeam)}</strong></div><div><small>AH</small><strong>${fmtLine(r.selectedLine??r.line)}</strong></div><div><small>Odds</small><strong class="odds">${fmtOdds(r.odds)}</strong></div><div><small>Result</small><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.resultGroup||r.result||'PENDING')}</span></div></div>`).join(''):'<div class="empty">No locked signals yet.</div>';
  const active=(live.matches||[]).filter(m=>m.realMarket?.status==='MATCH'||m.engine?.decision==='NEAR'||(m.engine?.streak||0)>0).sort((a,b)=>(b.engine?.momentum||0)-(a.engine?.momentum||0));
  $('#candidates').innerHTML=active.length?active.slice(0,20).map(m=>`<tr><td>${esc(m.home)}<br><span class="muted">${esc(m.away)}</span></td><td>${m.score?.home??'—'}-${m.score?.away??'—'}</td><td>${esc(m.engine?.side||'—')}</td><td class="pick">${fmtLine(m.engine?.line)}</td><td class="odds">${fmtOdds(m.engine?.odds)}</td><td>${m.engine?.momentum??'—'}%</td><td>${esc(m.realMarket?.status||'NOT FOUND')}<br><span class="muted">map ${m.realMarket?.mappingConfidence?Math.round(m.realMarket.mappingConfidence*100)+'%':'—'}</span></td><td>${esc(m.engine?.decision||'WATCH')} · ${m.engine?.streak??0}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">No current AH candidates with a real-market match.</td></tr>';
}
async function statistics(){
  const h=await api('/history?page=1&limit=100'),s=h.summary||{};
  const pairs=[['total',s.total],['settled',s.settled],['win',s.win],['loss',s.loss],['draw',s.draw],['winRate',`${Number(s.winRate||0).toFixed(1)}%`],['avgOdds',Number(s.averageOdds||0).toFixed(2)],['netUnits',Number(s.netUnits||0).toFixed(2)]];for(const [id,v] of pairs){const e=$(`#${id}`);if(e)e.textContent=v??0;}
  $('#statsRows').innerHTML=(h.records||[]).map(r=>`<tr><td>${fmtTime(r.selectedAt)}<br><span class="muted">${esc(r.selectionDate||'')}</span></td><td>${esc(r.home)}<br><span class="muted">${esc(r.away)}</span></td><td class="pick">${esc(r.selectedTeam)}</td><td>${fmtLine(r.selectedLine??r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${r.entryScore?.home??'—'}-${r.entryScore?.away??'—'}</td><td>${r.finalScore?`${r.finalScore.home}-${r.finalScore.away}`:'—'}</td><td><span class="status ${resultClass(r.resultGroup||r.result)}">${esc(r.settlementResult||r.resultGroup||r.result||'PENDING')}</span></td><td>${esc(r.bookmaker||r.pricingSource||'1xbet')}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No statistics yet.</td></tr>';
}
const settingFields=['side','minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','momentumMin','attackEvidenceRequirement','confirmationRounds','realMarketMaxAgeSeconds'];
async function settings(){
  const p=await api('/config'),c=p.config||{};for(const id of settingFields){const e=$(`#${id}`);if(e)e.value=c[id]??'';}$('#engineEnabled').checked=c.engineEnabled!==false;$('#marketLocked').textContent=p.marketLocked||'AH';$('#bookmaker').textContent=p.realMarketBookmaker||'1xbet';
  $('#settingsForm').addEventListener('submit',async ev=>{ev.preventDefault();const body={engineEnabled:$('#engineEnabled').checked};for(const id of settingFields){const e=$(`#${id}`);if(!e)continue;body[id]=e.type==='number'?(e.value===''?null:Number(e.value)):e.value;}body.market='AH';const out=await api('/config',{method:'POST',body:JSON.stringify(body)});$('#saveState').textContent=out.ok?'Saved':'Error';setTimeout(()=>$('#saveState').textContent='',2500);});
  $('#copy31').addEventListener('click',()=>{location.reload();});
}
async function run(){await bootRuntime();const page=document.body.dataset.page||'detector';nav(page);try{if(page==='detector'){await detector();setInterval(()=>detector().catch(console.error),(runtime.refreshSeconds||15)*1000);}else if(page==='statistics')await statistics();else if(page==='settings')await settings();}catch(e){const el=$('#pageError');if(el){el.textContent=e.message;el.hidden=false;}console.error(e);}}
run();
