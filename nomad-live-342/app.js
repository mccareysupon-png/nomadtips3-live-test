(()=>{
'use strict';
const SETTINGS_KEY='nomadSettings342';
const LEDGER_KEY='nomadLedger342';
const DEFAULTS={minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,scoreDifferenceFilterEnabled:true,maxScoreDifference:1,attackWeight:1,dangerousAttackWeight:2,homePressureShareMinimum:55,trendConditionsRequired:2,homeEventRequired:true,sotEvidenceEnabled:true,sotDeltaMinimum:1,shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,cornerEvidenceEnabled:true,cornerDeltaMinimum:1,evidenceMode:'ANY',oddsMinimum:1.80,oddsMaximumEnabled:false,oddsMaximum:2.40,maximumPriceAgeSeconds:30,oneSignalPerMatch:true};

const TEST_FIXTURES=[
 {id:'342-m88-zero',league:'NOMAD Test League',home:'River City',away:'North United',minute:67,score:[1,1],event:{snapshots:[
  {minute:62,attacks:[50,38],dangerous:[28,18],sot:[4,3],off:[6,3],corner:[3,2]},
  {minute:67,attacks:[61,42],dangerous:[38,21],sot:[5,3],off:[8,4],corner:[4,2]}
 ]},m88:{status:'VALID',rawHomeLine:'0',rawAwayLine:'',homeOddsRaw:0.85,awayOddsRaw:1.05,oddsFormat:'HK',transport:'DOM'}},
 {id:'342-m88-unsigned',league:'NOMAD Test League',home:'East Athletic',away:'Blue Town',minute:74,score:[0,0],event:{snapshots:[
  {minute:69,attacks:[44,42],dangerous:[21,20],sot:[2,2],off:[4,4],corner:[2,2]},
  {minute:74,attacks:[56,47],dangerous:[31,24],sot:[3,2],off:[6,5],corner:[3,2]}
 ]},m88:{status:'VALID',rawHomeLine:'0.5',rawAwayLine:'',homeOddsRaw:0.84,awayOddsRaw:1.06,oddsFormat:'HK',transport:'DOM'}},
 {id:'342-m88-too-early',league:'NOMAD Test League',home:'Green FC',away:'Capital Stars',minute:49,score:[0,1],event:{snapshots:[
  {minute:44,attacks:[48,31],dangerous:[24,14],sot:[3,1],off:[5,2],corner:[2,1]},
  {minute:49,attacks:[64,35],dangerous:[37,16],sot:[5,1],off:[7,3],corner:[4,1]}
 ]},m88:{status:'VALID',rawHomeLine:'0',rawAwayLine:'',homeOddsRaw:0.88,awayOddsRaw:1.02,oddsFormat:'HK',transport:'DOM'}}
];

function settings(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {...DEFAULTS}}}
function saveSettings(v){localStorage.setItem(SETTINGS_KEY,JSON.stringify(v));}
function fmtLine(n){if(n===null||n===undefined)return '—';return `${n>0?'+':''}${Number(Number(n).toFixed(2))}`}
function delta(a,b,i){return Number(b?.[i]||0)-Number(a?.[i]||0)}
function eventMetrics(m,c){
 const snaps=[...(m.event?.snapshots||[])].sort((a,b)=>a.minute-b.minute);
 const eligible=snaps.filter(s=>s.minute>=m.minute-c.rollingWindowMinutes&&s.minute<=m.minute);
 const first=eligible[0]||snaps[0],last=eligible.at(-1)||snaps.at(-1);
 if(!first||!last)return null;
 const hA=delta(first.attacks,last.attacks,0),aA=delta(first.attacks,last.attacks,1);
 const hD=delta(first.dangerous,last.dangerous,0),aD=delta(first.dangerous,last.dangerous,1);
 const hWeighted=hA*c.attackWeight+hD*c.dangerousAttackWeight;
 const aWeighted=aA*c.attackWeight+aD*c.dangerousAttackWeight;
 const total=Math.max(0,hWeighted)+Math.max(0,aWeighted);
 const pressureShare=total>0?(Math.max(0,hWeighted)/total)*100:0;
 const sotDelta=delta(first.sot,last.sot,0),awaySotDelta=delta(first.sot,last.sot,1);
 const offDelta=delta(first.off,last.off,0),awayOffDelta=delta(first.off,last.off,1);
 const cornerDelta=delta(first.corner,last.corner,0),awayCornerDelta=delta(first.corner,last.corner,1);
 const trend=[hWeighted>aWeighted,hD>aD,(sotDelta+offDelta)>(awaySotDelta+awayOffDelta)];
 return {from:first.minute,to:last.minute,pressureShare:Number(pressureShare.toFixed(1)),trendPass:trend.filter(Boolean).length,sotDelta,offDelta,cornerDelta,attacks:`+${hA} / +${aA}`,dangerous:`+${hD} / +${aD}`};
}
function eventCheck(m,c){
 const reasons=[];let pass=true;const metrics=eventMetrics(m,c);
 if(m.minute<c.minuteFrom||m.minute>c.minuteTo){pass=false;reasons.push(`minute ${m.minute} outside ${c.minuteFrom}–${c.minuteTo}`)}else reasons.push(`minute ${m.minute} in window`);
 if(c.scoreDifferenceFilterEnabled&&Math.abs(m.score[0]-m.score[1])>c.maxScoreDifference){pass=false;reasons.push('score gap rejected')}else reasons.push('score gate pass');
 if(!metrics){pass=false;reasons.push('rolling event window unavailable');return {pass,reasons,metrics:null}}
 if(metrics.pressureShare<c.homePressureShareMinimum){pass=false;reasons.push(`HOME pressure ${metrics.pressureShare}% < ${c.homePressureShareMinimum}%`)}else reasons.push(`HOME pressure ${metrics.pressureShare}% pass`);
 if(metrics.trendPass<c.trendConditionsRequired){pass=false;reasons.push(`trend ${metrics.trendPass}/3 < ${c.trendConditionsRequired}/3`)}else reasons.push(`trend ${metrics.trendPass}/3 pass`);
 const ev=[];if(c.sotEvidenceEnabled)ev.push(metrics.sotDelta>=c.sotDeltaMinimum);if(c.shotOffEvidenceEnabled)ev.push(metrics.offDelta>=c.shotOffDeltaMinimum);if(c.cornerEvidenceEnabled)ev.push(metrics.cornerDelta>=c.cornerDeltaMinimum);
 if(c.homeEventRequired){const ep=c.evidenceMode==='ALL'?ev.length>0&&ev.every(Boolean):ev.some(Boolean);if(!ep){pass=false;reasons.push(`new HOME event ${c.evidenceMode} rejected`)}else reasons.push(`new HOME event ${c.evidenceMode} pass`)}
 return {pass,reasons,metrics};
}
function makeTestObservation(m){return {...m.m88,matchId:m.id,home:m.home,away:m.away,minute:m.minute,score:m.score,observedAt:Date.now()-5000}}
function m88Check(m,c){
 const api=window.NOMADM88;if(!api)return {pass:false,obs:null,reason:'M88 OBSERVER MODULE MISSING'};
 const obs=api.normalizeObservation(makeTestObservation(m),c.maximumPriceAgeSeconds);
 if(obs.status!=='VALID')return {pass:false,obs,reason:obs.status==='UNKNOWN'?'M88 HDP SIGN UNKNOWN — WAIT':`M88 ${obs.status} — WAIT`};
 if(obs.homeOddsDecimal<c.oddsMinimum)return {pass:false,obs,reason:`M88 PRICE ${obs.homeOddsDecimal.toFixed(2)} BELOW MINIMUM`};
 if(c.oddsMaximumEnabled&&obs.homeOddsDecimal>c.oddsMaximum)return {pass:false,obs,reason:`M88 PRICE ${obs.homeOddsDecimal.toFixed(2)} ABOVE MAXIMUM`};
 return {pass:true,obs,reason:'M88 PRICE CONFIRMED'};
}
function evaluate(m,c=settings()){
 const event=eventCheck(m,c);const candidate=event.pass;
 const price=candidate?m88Check(m,c):{pass:false,obs:null,reason:'NOT CHECKED — EVENT REJECTED'};
 const signal=candidate&&price.pass;
 return {m,event,candidate,price,signal,decision:signal?'SIGNAL':candidate?'WAIT':'WATCH'};
}
function saveLedger(r,c=settings()){
 if(!r.signal)return;let rows=[];try{rows=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]')}catch{}
 if(c.oneSignalPerMatch&&rows.some(x=>x.id===r.m.id))return;
 const o=r.price.obs;rows.unshift({id:r.m.id,ts:new Date().toISOString(),match:`${r.m.home} — ${r.m.away}`,minute:r.m.minute,score:r.m.score.join('–'),line:fmtLine(o.decodedHomeLine),rawLine:o.rawHomeLine,odds:o.homeOddsDecimal,rawOdds:o.homeOddsRaw,oddsFormat:o.oddsFormat,source:'M88',result:'PENDING',reason:'EVENT PASS + M88 VALID + FINAL JUDGE'});
 localStorage.setItem(LEDGER_KEY,JSON.stringify(rows.slice(0,100)));
}
function m88Box(r){
 if(!r.price.obs)return `<div class="book"><span>M88</span><b class="bad">NOT CHECKED</b><span>Event gate rejected</span></div>`;
 const o=r.price.obs;const cls=o.status==='VALID'?'valid':o.status==='STALE'?'stale':'bad';
 return `<div class="book"><span>M88 · Official DOM slot</span><b class="${cls}">${o.status}</b><span>RAW HOME HDP ${o.rawHomeLine||'—'} · RAW HK ${o.homeOddsRaw??'—'} / ${o.awayOddsRaw??'—'} · DEC ${o.homeOddsDecimal??'—'} / ${o.awayOddsDecimal??'—'} · ${o.ageSeconds??'—'}s</span></div><div class="note">Decode: ${o.decodeStatus} · ${o.decodeReason}</div>`;
}
function matchCard(r){
 const m=r.m,em=r.event.metrics;
 return `<article class="match"><div class="match-head"><div><span class="league">${m.league}</span><span class="minute">${m.minute}'</span></div><div><span class="league">HOME CANDIDATE</span><div class="teams">${m.home} — ${m.away}</div></div><div class="score">${m.score.join('–')}</div><div class="market"><span class="league">M88 HOME AH / DECIMAL</span><strong>${r.price.obs?.decodedHomeLine===null||r.price.obs?.decodedHomeLine===undefined?'—':fmtLine(r.price.obs.decodedHomeLine)} ${r.price.obs?.homeOddsDecimal?'@ '+r.price.obs.homeOddsDecimal.toFixed(2):''}</strong></div><div class="badge ${r.signal?'signal':'wait'}">${r.decision}</div></div><div class="details"><div class="box"><h3>EVENT → CANDIDATE</h3><div class="kv"><span>Rolling window</span><b>${em?`${em.from}'–${em.to}'`:'—'}</b></div><div class="kv"><span>Pressure</span><b>${em?em.pressureShare+'%':'—'}</b></div><div class="kv"><span>Attack Δ H/A</span><b>${em?.attacks||'—'}</b></div><div class="kv"><span>Dangerous Δ H/A</span><b>${em?.dangerous||'—'}</b></div><div class="kv"><span>SOT / OFF / COR Δ</span><b>${em?`+${em.sotDelta} / +${em.offDelta} / +${em.cornerDelta}`:'—'}</b></div><div class="kv"><span>Event Gate</span><b class="${r.event.pass?'oktxt':'redtxt'}">${r.event.pass?'PASS':'REJECT'}</b></div></div><div class="box"><h3>M88 DIRECT PRICE OBSERVER</h3>${m88Box(r)}</div><div class="box"><h3>FRESHNESS → เซียน K</h3><div class="kv"><span>Candidate</span><b>${r.candidate?'YES':'NO'}</b></div><div class="kv"><span>M88 status</span><b>${r.price.obs?.status||'NOT CHECKED'}</b></div><div class="kv"><span>Normalized HOME AH</span><b>${fmtLine(r.price.obs?.decodedHomeLine)}</b></div><div class="kv"><span>HOME decimal odds</span><b>${r.price.obs?.homeOddsDecimal??'—'}</b></div><div class="kv"><span>Price verdict</span><b>${r.price.reason}</b></div><div class="kv"><span>Final Judge</span><b class="${r.signal?'oktxt':'waittxt'}">${r.signal?'SIGNAL':'NO SIGNAL'}</b></div></div></div><div class="note">${r.event.reasons.join(' · ')}</div></article>`;
}
function renderExternalObserver(c){
 const host=document.getElementById('observerCard');if(!host||!window.NOMADM88)return;
 const raw=window.NOMADM88.read();const status=document.getElementById('m88ObserverStatus');
 if(!raw){host.innerHTML='<div class="note">No live M88 observation has been ingested into the 3.42 adapter yet. Browser scout proved the Official DOM path, but this static GitHub Pages build does not read the cross-origin M88 iframe itself.</div>';if(status)status.textContent='ADAPTER READY';return;}
 const o=window.NOMADM88.normalizeObservation(raw,c.maximumPriceAgeSeconds);
 host.innerHTML=`<div class="kv"><span>Match</span><b>${o.home||'—'} — ${o.away||'—'}</b></div><div class="kv"><span>RAW HOME HDP</span><b>${o.rawHomeLine||'—'}</b></div><div class="kv"><span>RAW HK Odds</span><b>${o.homeOddsRaw??'—'} / ${o.awayOddsRaw??'—'}</b></div><div class="kv"><span>Normalized decimal</span><b>${o.homeOddsDecimal??'—'} / ${o.awayOddsDecimal??'—'}</b></div><div class="kv"><span>Decode / Source</span><b>${o.decodeStatus} / ${o.status}</b></div>`;
 if(status)status.textContent=o.status;
}
function renderLive(){
 const c=settings(),results=TEST_FIXTURES.map(m=>evaluate(m,c));const list=document.getElementById('matchList');if(list)list.innerHTML=results.map(matchCard).join('');
 const ids={liveCount:results.length,watchCount:results.filter(x=>!x.candidate).length,candidateCount:results.filter(x=>x.candidate).length,signalCount:results.filter(x=>x.signal).length};Object.entries(ids).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v});
 document.querySelectorAll('[data-pipe]').forEach(x=>x.classList.add('ok'));window.__nomad342Results=results;renderExternalObserver(c);
}
function runCheck(){const c=settings(),results=TEST_FIXTURES.map(m=>evaluate(m,c));results.forEach(r=>saveLedger(r,c));renderLive();const el=document.getElementById('runStatus');if(el)el.textContent=`M88 logic cycle complete · ${results.filter(r=>r.signal).length} signal · ${new Date().toLocaleTimeString()}`;}
function renderStats(){let rows=[];try{rows=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]')}catch{}const tbody=document.getElementById('statsBody');if(tbody)tbody.innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.ts).toLocaleString()}</td><td>${r.match}</td><td>${r.minute}'</td><td>${r.score}</td><td>HOME ${r.line}<br><small>RAW ${r.rawLine}</small></td><td>${r.odds}<br><small>${r.rawOdds} ${r.oddsFormat}</small></td><td>${r.source}</td><td class="waittxt">${r.result}</td><td>${r.reason}</td></tr>`).join(''):`<tr><td colspan="9">No 3.42 M88 signal snapshot yet. Open Live and press RUN M88 LOGIC CHECK.</td></tr>`;}
function renderHealth(){
 const grid=document.getElementById('healthGrid');if(!grid)return;const hasLive=Boolean(window.NOMADM88?.read());const items=[
  ['TotalCorner Event Adapter','TEST FIXTURE','3.42 UI still uses isolated event fixtures; no production event request from this static page.'],
  ['M88 Direct Observer','SCOUT PASS','Official M88/MSports Live Soccer DOM was verified without login; adapter boundary preserves raw HDP and Hong Kong odds.'],
  ['M88 Live Transport',hasLive?'OBSERVATION':'ADAPTER READY',hasLive?'A local observation exists in nomadM88Observation342.':'Static GitHub Pages cannot read the cross-origin M88 iframe by itself; Work/browser capture must feed the adapter later.'],
  ['M88 HDP Side-Sign Decode','WAITING','Unsigned non-zero HOME HDP such as 0.5 fails closed as UNKNOWN. Zero or explicit signed lines are safe.'],
  ['Hong Kong Odds Normalizer','READY','M88 HK odds are preserved RAW and normalized to decimal for the existing NOMAD odds gate.'],
  ['Freshness Gate','READY','VALID becomes STALE when observation age exceeds the configured maximum.'],
  ['เซียน K Final Judge','READY','EVENT PASS + M88 VALID + decodable line + fresh price inside odds gate.'],
  ['Storage namespace','READY',`${SETTINGS_KEY} / ${LEDGER_KEY} / ${window.NOMADM88?.STORAGE_KEY||'nomadM88Observation342'}`]
 ];grid.innerHTML=items.map(i=>`<article class="health-item"><header><span>${i[0]}</span><b class="${i[1]==='READY'||i[1]==='SCOUT PASS'||i[1]==='OBSERVATION'?'oktxt':'waittxt'}">${i[1]}</b></header><div class="note">${i[2]}</div></article>`).join('');
}
function bindSettings(){
 const form=document.getElementById('settingsForm');if(!form)return;const c=settings();Object.entries(c).forEach(([k,v])=>{const e=form.elements[k];if(!e)return;if(e.type==='checkbox')e.checked=Boolean(v);else e.value=v});
 form.addEventListener('submit',e=>{e.preventDefault();const v={...c};for(const [k,d] of Object.entries(DEFAULTS)){const x=form.elements[k];if(!x)continue;if(typeof d==='boolean')v[k]=x.checked;else if(typeof d==='number')v[k]=Number(x.value);else v[k]=x.value}saveSettings(v);document.getElementById('saveStatus').textContent='Saved to isolated 3.42 browser namespace';});
 document.getElementById('defaultsButton')?.addEventListener('click',()=>{saveSettings(DEFAULTS);location.reload()});
}
document.addEventListener('DOMContentLoaded',()=>{const p=document.body.dataset.page;if(p==='live'){renderLive();document.getElementById('runCheck')?.addEventListener('click',runCheck);document.getElementById('resetLedger')?.addEventListener('click',()=>{localStorage.removeItem(LEDGER_KEY);document.getElementById('runStatus').textContent='3.42 ledger cleared'})}if(p==='statistics')renderStats();if(p==='health')renderHealth();if(p==='settings')bindSettings();});
})();