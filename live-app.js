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
  if(['NS','TBD'].includes(s))return{label:'WAITING',minute:'WAITING',cls:'waiting'};
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
    <nav class="tabs"><button class="active" data-tab="stats">Stats</button><button data-tab="timeline">Timeline</button></nav>
    <section class="panel active" data-panel="stats"><div data-k="stats" class="stat-list"><p class="empty">Loading statistics</p></div></section>
    <section class="panel" data-panel="timeline"><div data-k="events" class="event-list"><p class="empty">No events yet</p></div></section>
    <section class="pick"><div><small>CORE PICK</small><b data-k="pick">N/A</b></div><div><small>CONFIDENCE</small><b data-k="confidence">N/A</b></div><div><small>PREDICTED</small><b data-k="predicted">N/A</b></div></section>
    <footer><span data-k="updated">Waiting for update</span><span>Score 15 sec · Events 30 sec · Stats 60 sec</span></footer>
  </article>`;
}

function el(root,key){return root.querySelector(`[data-k="${key}"]`)}

function bindTabs(root){
  root.querySelectorAll('.tabs button').forEach(btn=>btn.addEventListener('click',()=>{
    root.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
    root.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    root.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('active');
  }));
}

function statRow(label,home,away){
  if((home===null||home===undefined||home==='')&&(away===null||away===undefined||away===''))return'';
  const h=num(home),a=num(away),total=h!==null&&a!==null&&h+a>0?h+a:null;
  const hp=total?Math.round(h/total*100):50,ap=total?Math.round(a/total*100):50;
  return `<div class="stat-row"><b>${esc(shown(home))}</b><div><small>${esc(label)}</small><span><i style="width:${hp}%"></i><i class="away" style="width:${ap}%"></i></span></div><b>${esc(shown(away))}</b></div>`;
}

function updateCount(){
  const n=host.querySelectorAll('.match-card').length;
  document.getElementById('matchCount').textContent=`LIVE SCORES BETA · ${n} ${n===1?'MATCH':'MATCHES'}`;
}

function removeMatch(name){
  const item=state.get(name);
  if(!item)return;
  clearInterval(item.timer);
  item.root.remove();
  state.delete(name);
  updateCount();
}

function render(name,data){
  const item=state.get(name);if(!item)return;
  const root=item.root,m=data.match||{};
  const status=statusInfo(m.status,m.elapsed,data.fetched_at_utc);
  if(TERMINAL.has(String(m.status||'').toUpperCase())){removeMatch(name);return;}
  item.clock={status:m.status,elapsed:m.elapsed,updated:data.fetched_at_utc};
  const home=m.home?.name||'Home',away=m.away?.name||'Away';
  const hc=shirtColor(home),ac=shirtColor(away,hc);
  el(root,'league').textContent=[m.country,m.league].filter(Boolean).join(' · ');
  el(root,'status').textContent=status.label;el(root,'status').className=`status ${status.cls}`;
  el(root,'minute').textContent=status.minute;
  el(root,'home').textContent=home;el(root,'away').textContent=away;
  el(root,'homeShirt').style.setProperty('--shirt',hc);el(root,'awayShirt').style.setProperty('--shirt',ac);
  el(root,'score').textContent=`${shown(m.score?.home)} : ${shown(m.score?.away)}`;
  if(m.kickoff_utc){const d=new Date(m.kickoff_utc);el(root,'kickoff').textContent=d.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});}
  const st=m.stats||{};
  const statHtml=stats.map(([label,key])=>statRow(label,st[key]?.home,st[key]?.away)).filter(Boolean).join('');
  el(root,'stats').innerHTML=statHtml||'<p class="empty">Provider has not supplied match statistics.</p>';
  const events=Array.isArray(m.events)?[...m.events].sort((a,b)=>(Number(b.minute)||0)-(Number(a.minute)||0)):[];
  el(root,'events').innerHTML=events.length?events.slice(0,30).map(e=>`<div class="event"><b>${esc(e.minute??'–')}′</b><div><strong>${esc([e.type,e.team].filter(Boolean).join(' — '))}</strong><small>${esc([e.detail,e.player].filter(Boolean).join(' · '))}</small></div></div>`).join(''):'<p class="empty">No events yet.</p>';
  const latest=events[0];
  el(root,'latest').textContent=latest?[latest.team,latest.type,latest.detail].filter(Boolean).join(' · '):'No events available yet';
  el(root,'latestMinute').textContent=latest?`${latest.minute??'—'}′`:'—';
  el(root,'pick').textContent=m.pick||'N/A';
  el(root,'confidence').textContent=m.confidence!==null&&m.confidence!==undefined?`${m.confidence}%`:'N/A';
  el(root,'predicted').textContent=m.predicted_score||'N/A';
  el(root,'updated').textContent=data.fetched_at_utc?`Updated ${new Date(data.fetched_at_utc).toLocaleString('th-TH')}`:'Waiting for update';
}

async function loadMatch(name){
  const item=state.get(name);if(!item)return;
  try{
    const response=await fetch(`${RAW}${name}?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    render(name,await response.json());
  }catch(error){
    el(item.root,'status').textContent='LOAD ERROR';
    el(item.root,'status').className='status error';
    el(item.root,'updated').textContent=String(error.message||error);
  }
}

function tickClocks(){
  for(const item of state.values()){
    if(!item.clock)continue;
    const s=statusInfo(item.clock.status,item.clock.elapsed,item.clock.updated);
    el(item.root,'status').textContent=s.label;el(item.root,'minute').textContent=s.minute;
  }
}

async function syncManifest(){
  try{
    const response=await fetch(`${RAW}live-matches.json?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Manifest HTTP ${response.status}`);
    const data=await response.json();
    const files=Array.isArray(data.files)?data.files:[];
    const wanted=new Set(files);
    for(const name of [...state.keys()])if(!wanted.has(name))removeMatch(name);
    for(const name of files){
      if(state.has(name))continue;
      host.insertAdjacentHTML('beforeend',card(name));
      const root=host.lastElementChild;bindTabs(root);
      const timer=setInterval(()=>loadMatch(name),15000);
      state.set(name,{root,timer,clock:null});
      loadMatch(name);
    }
    updateCount();
  }catch(error){console.error(error);}
}

syncManifest();
setInterval(syncManifest,15000);
setInterval(tickClocks,15000);
