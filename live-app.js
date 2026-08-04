const RAW='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/';
const TERMINAL=new Set(['FT','AET','PEN','CANC','ABD','AWD','WO','PST']);
const state=new Map();
const host=document.getElementById('matches');
const palette=['#2563eb','#dc2626','#f59e0b','#16a34a','#7c3aed','#0891b2','#e11d48','#f97316','#4f46e5','#65a30d'];
const stats=[
  ['Attacks','attacks'],['Dangerous Attacks','dangerous_attacks'],['Expected Goals (xG)','expected_goals'],
  ['Ball Possession','possession'],['Total Shots','shots'],['Shots on Target','shots_on_target'],
  ['Shots off Target','shots_off_target'],['Blocked Shots','blocked_shots'],['Shots Inside Box','shots_inside_box'],
  ['Shots Outside Box','shots_outside_box'],['Corner Kicks','corners'],['Fouls','fouls'],['Offsides','offsides'],
  ['Goalkeeper Saves','goalkeeper_saves'],['Total Passes','total_passes'],['Accurate Passes','accurate_passes'],
  ['Pass Accuracy','pass_accuracy'],['Yellow Cards','yellow_cards'],['Red Cards','red_cards']
];

const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const shown=v=>v===null||v===undefined||v===''?'–':v;
const num=v=>{const n=Number(String(v??'').replace('%',''));return Number.isFinite(n)?n:null};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fetchJson(url,timeout=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }finally{clearTimeout(timer)}
}

function shirtColor(name,avoid=''){
  let hash=0;
  for(const ch of String(name||''))hash=((hash<<5)-hash)+ch.charCodeAt(0);
  let color=palette[Math.abs(hash)%palette.length];
  if(color===avoid)color=palette[(Math.abs(hash)+3)%palette.length];
  return color;
}

function statusInfo(status,elapsed,updated){
  const s=String(status||'').toUpperCase();
  if(TERMINAL.has(s))return{label:'FT',minute:'FT',cls:'finished'};
  if(s==='HT')return{label:'HT',minute:'HT · 45′',cls:''};
  if(['NS','TBD',''].includes(s))return{label:'WAITING',minute:'WAITING',cls:'waiting'};
  let minute=Number(elapsed);
  if(Number.isFinite(minute)&&updated){
    const age=Math.max(0,Math.floor((Date.now()-new Date(updated).getTime())/60000));
    minute+=Math.min(age,5);
    if(s==='1H')minute=Math.min(minute,45);
    if(s==='2H')minute=Math.min(minute,90);
  }
  const text=Number.isFinite(minute)?`LIVE ${minute}′`:'LIVE';
  return{label:text,minute:text,cls:''};
}

function card(name){
  return `<article class="match-card" data-file="${esc(name)}">
    <header class="match-head"><span data-k="league">FOOTBALL</span><b class="status waiting" data-k="status">LOADING</b></header>
    <section class="scoreboard">
      <div class="team"><i class="shirt" data-k="homeShirt"></i><strong data-k="home">Home</strong><small>HOME</small></div>
      <div class="scorebox"><span data-k="minute">—</span><b data-k="score">– : –</b><small data-k="kickoff">Loading</small></div>
      <div class="team"><i class="shirt" data-k="awayShirt"></i><strong data-k="away">Away</strong><small>AWAY</small></div>
    </section>
    <section class="latest"><i></i><div><small>LATEST EVENT</small><b data-k="latest">No events yet</b></div><strong data-k="latestMinute">—</strong></section>
    <nav class="tabs"><button class="active" type="button" data-tab="stats">Stats</button><button type="button" data-tab="timeline">Timeline</button></nav>
    <section class="panel active" data-panel="stats"><div data-k="stats" class="stat-list"><p class="empty">Loading statistics</p></div></section>
    <section class="panel" data-panel="timeline"><div data-k="events" class="event-list"><p class="empty">No events yet</p></div></section>
    <section class="pick"><div><small>CORE PICK</small><b data-k="pick">N/A</b></div><div><small>CONFIDENCE</small><b data-k="confidence">N/A</b></div><div><small>PREDICTED</small><b data-k="predicted">N/A</b></div></section>
    <section class="markets"><div><small>LOCKED ODDS</small><b data-k="odds">N/A</b></div><div><small>BTTS</small><b data-k="btts">N/A</b></div><div><small>DOUBLE CHANCE</small><b data-k="doubleChance">N/A</b></div><div><small>ASIAN HANDICAP</small><b data-k="asianHandicap">N/A</b></div></section>
    <section class="reason"><small>MANUAL SET 2 REASON</small><p data-k="reason">Waiting for selection data.</p></section>
    <footer><span data-k="updated">Waiting for update</span><span>Shared refresh queue · mobile safe</span></footer>
  </article>`;
}

function el(root,key){return root.querySelector(`[data-k="${key}"]`)}

function bindTabs(root){
  root.querySelector('.tabs')?.addEventListener('click',event=>{
    const button=event.target.closest('button[data-tab]');
    if(!button)return;
    root.querySelectorAll('.tabs button').forEach(node=>node.classList.remove('active'));
    root.querySelectorAll('.panel').forEach(node=>node.classList.remove('active'));
    button.classList.add('active');
    root.querySelector(`[data-panel="${button.dataset.tab}"]`)?.classList.add('active');
  });
}

function statRow(label,home,away){
  if((home===null||home===undefined||home==='')&&(away===null||away===undefined||away===''))return'';
  const h=num(home),a=num(away),total=h!==null&&a!==null&&h+a>0?h+a:null;
  const hp=total?Math.round(h/total*100):50,ap=total?Math.round(a/total*100):50;
  return `<div class="stat-row"><b>${esc(shown(home))}</b><div><small>${esc(label)}</small><span><i style="width:${hp}%"></i><i class="away" style="width:${ap}%"></i></span></div><b>${esc(shown(away))}</b></div>`;
}

function emptyState(){
  if(host.querySelector('.match-card'))return;
  if(!host.querySelector('.empty-state'))host.innerHTML='<section class="empty-state"><strong>NO ACTIVE MATCHES</strong><span>Waiting for the next locked Manual Set 2 fixtures.</span></section>';
}
function clearEmptyState(){host.querySelector('.empty-state')?.remove()}
function updateCount(){
  const count=state.size;
  document.getElementById('matchCount').textContent=`MANUAL SET 2 · ${count} ${count===1?'MATCH':'MATCHES'}`;
  if(!count)emptyState();
}
function removeMatch(name){
  const item=state.get(name);
  if(!item)return;
  item.root.remove();
  state.delete(name);
  updateCount();
}

function render(name,data){
  const item=state.get(name);if(!item)return;
  const root=item.root,m=data.match||{};
  if(TERMINAL.has(String(m.status||'').toUpperCase())){removeMatch(name);return;}
  item.clock={status:m.status,elapsed:m.elapsed,updated:data.fetched_at_utc};
  const home=m.home?.name||'Home',away=m.away?.name||'Away';
  const hc=shirtColor(home),ac=shirtColor(away,hc);
  const status=statusInfo(m.status,m.elapsed,data.fetched_at_utc);
  el(root,'league').textContent=[m.country,m.league].filter(Boolean).join(' · ')||'FOOTBALL';
  el(root,'status').textContent=status.label;el(root,'status').className=`status ${status.cls}`;
  el(root,'minute').textContent=status.minute;
  el(root,'home').textContent=home;el(root,'away').textContent=away;
  el(root,'homeShirt').style.setProperty('--shirt',hc);el(root,'awayShirt').style.setProperty('--shirt',ac);
  el(root,'score').textContent=`${shown(m.score?.home)} : ${shown(m.score?.away)}`;
  if(m.kickoff_utc)el(root,'kickoff').textContent=new Date(m.kickoff_utc).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const st=m.stats||{};
  el(root,'stats').innerHTML=stats.map(([label,key])=>statRow(label,st[key]?.home,st[key]?.away)).filter(Boolean).join('')||'<p class="empty">Provider has not supplied match statistics.</p>';
  const events=Array.isArray(m.events)?[...m.events].sort((a,b)=>(Number(b.minute)||0)-(Number(a.minute)||0)):[];
  el(root,'events').innerHTML=events.length?events.slice(0,24).map(event=>`<div class="event"><b>${esc(event.minute??'–')}′</b><div><strong>${esc([event.type,event.team].filter(Boolean).join(' — '))}</strong><small>${esc([event.detail,event.player].filter(Boolean).join(' · '))}</small></div></div>`).join(''):'<p class="empty">No events yet.</p>';
  const latest=events[0];
  el(root,'latest').textContent=latest?[latest.team,latest.type,latest.detail].filter(Boolean).join(' · '):'No events available yet';
  el(root,'latestMinute').textContent=latest?`${latest.minute??'—'}′`:'—';
  el(root,'pick').textContent=m.pick||'N/A';
  el(root,'confidence').textContent=m.confidence!==null&&m.confidence!==undefined?`${m.confidence}%`:'N/A';
  el(root,'predicted').textContent=m.predicted_score||'N/A';
  el(root,'odds').textContent=m.odds!==null&&m.odds!==undefined?String(m.odds):'N/A';
  el(root,'btts').textContent=m.btts||'N/A';
  el(root,'doubleChance').textContent=m.double_chance||'N/A';
  el(root,'asianHandicap').textContent=m.asian_handicap||'N/A';
  el(root,'reason').textContent=m.reason||'Manual analysis recorded.';
  el(root,'updated').textContent=data.fetched_at_utc?`Updated ${new Date(data.fetched_at_utc).toLocaleString()}`:'Waiting for update';
  window.dispatchEvent(new CustomEvent('nomad:live-data',{detail:{name,data,card:root}}));
}

async function loadMatch(name){
  const item=state.get(name);
  if(!item||item.loading||document.hidden)return;
  item.loading=true;
  try{
    const data=await fetchJson(`${RAW}${name}?t=${Date.now()}`);
    const signature=`${data.fetched_at_utc||''}|${data.match?.status||''}|${data.match?.score?.home??''}:${data.match?.score?.away??''}|${data.match?.elapsed??''}`;
    if(signature!==item.signature){item.signature=signature;render(name,data)}
    else window.dispatchEvent(new CustomEvent('nomad:live-data',{detail:{name,data,card:item.root}}));
  }catch(error){
    if(error.name!=='AbortError'){
      el(item.root,'status').textContent='RETRYING';
      el(item.root,'status').className='status error';
      el(item.root,'updated').textContent=String(error.message||error);
    }
  }finally{item.loading=false}
}

async function refreshAll(){
  if(document.hidden||refreshAll.running)return;
  refreshAll.running=true;
  try{
    const names=[...state.keys()];
    for(let index=0;index<names.length;index+=2){
      await Promise.allSettled(names.slice(index,index+2).map(loadMatch));
      if(index+2<names.length)await sleep(120);
    }
  }finally{refreshAll.running=false}
}

function tickClocks(){
  for(const item of state.values()){
    if(!item.clock)continue;
    const status=statusInfo(item.clock.status,item.clock.elapsed,item.clock.updated);
    el(item.root,'status').textContent=status.label;
    el(item.root,'minute').textContent=status.minute;
  }
}

async function syncManifest(){
  if(syncManifest.running)return;
  syncManifest.running=true;
  try{
    const data=await fetchJson(`${RAW}live-matches.json?t=${Date.now()}`);
    const files=Array.isArray(data.files)?data.files:[];
    const wanted=new Set(files);
    for(const name of [...state.keys()])if(!wanted.has(name))removeMatch(name);
    if(files.length)clearEmptyState();
    for(const name of files){
      if(state.has(name))continue;
      host.insertAdjacentHTML('beforeend',card(name));
      const root=host.lastElementChild;
      bindTabs(root);
      state.set(name,{root,clock:null,loading:false,signature:null});
      window.dispatchEvent(new CustomEvent('nomad:card-added',{detail:{name,card:root}}));
    }
    updateCount();
    await refreshAll();
  }catch(error){console.error('Manifest refresh failed',error);emptyState()}
  finally{syncManifest.running=false}
}

syncManifest();
setInterval(refreshAll,30000);
setInterval(syncManifest,60000);
setInterval(tickClocks,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncManifest();refreshAll()}});
