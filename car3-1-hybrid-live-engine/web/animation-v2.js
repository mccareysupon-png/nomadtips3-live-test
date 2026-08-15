const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
let runtime=null,latest=null,selectedId=null;

function ensureUi(){
  const pitch=$('#pitch');if(!pitch||pitch.dataset.v2)return;pitch.dataset.v2='1';pitch.classList.add('v2');
  const market=document.createElement('div');market.id='liveMarketStrip';market.className='live-market-strip';pitch.parentElement.insertBefore(market,pitch);
  pitch.insertAdjacentHTML('beforeend','<div class="pitch-route"></div><div id="pitchSelected" class="pitch-team pitch-team-selected"><small>SELECTED</small><b>—</b></div><div id="pitchOpponent" class="pitch-team pitch-team-opponent"><small>OPPONENT</small><b>—</b></div><div id="liveEventBadge" class="live-event-badge"><small>LIVE ACTIVITY</small><b>POSSESSION</b></div>');
  const timeline=document.createElement('div');timeline.id='pitchTimeline';timeline.className='match-timeline';pitch.parentElement.appendChild(timeline);
}

function eventIcon(type){const t=String(type||'').toUpperCase();if(t.includes('GOAL'))return'⚽';if(t.includes('RED'))return'🟥';if(t.includes('YELLOW'))return'🟨';if(t.includes('CORNER'))return'⚑';if(t.includes('SHOT'))return'◎';if(t.includes('SUB'))return'↔';return'•';}
function activityClass(type){const t=String(type||'').toUpperCase();if(t==='GOAL')return'goal';if(t==='SHOT ON TARGET')return'sot';if(t==='SHOT')return'shot';if(t==='CORNER')return'corner';if(t==='RED CARD')return'red';if(t==='YELLOW CARD')return'yellow';if(t==='DANGEROUS ATTACK')return'danger';if(t==='ATTACK')return'attack';return'possession';}
function coords(activity,minute){const selected=activity?.team!=='AWAY',type=String(activity?.type||'POSSESSION').toUpperCase();let x=selected?60:40,y=50;if(type==='ATTACK'){x=selected?67:33;y=46}else if(type==='DANGEROUS ATTACK'){x=selected?78:22;y=48}else if(type==='SHOT'){x=selected?86:14;y=49}else if(type==='SHOT ON TARGET'||type==='GOAL'){x=selected?91:9;y=50}else if(type==='CORNER'){x=selected?94:6;y=selected?17:83}else{x=selected?57:43;y=42+(Number(minute||0)%4)*5}return{x,y,selected};}

function selectedMatch(){
  if(!latest?.matches?.length)return null;
  const active=document.querySelector('.candidate.active');
  const text=active?.querySelector('.teams')?.textContent||'';
  if(text){const byText=latest.matches.find(m=>text.includes(m.home)&&text.includes(m.away));if(byText)return byText;}
  if(selectedId){const byId=latest.matches.find(m=>String(m.sourceMatchId)===String(selectedId));if(byId)return byId;}
  return latest.matches[0];
}

function orient(m){
  const homeName=$('#homeTeam')?.textContent?.trim(),selectedAway=homeName&&homeName===m.away;
  const flip=selectedAway;
  const team=t=>flip?(t==='HOME'?'OPPONENT':'SELECTED'):(t==='HOME'?'SELECTED':'OPPONENT');
  const odds=m.odds||{},ah=odds.asianHandicap||{},one=odds.oneXtwo||{},ou=odds.overUnder||{};
  return{flip,team,selected:flip?m.away:m.home,opponent:flip?m.home:m.away,activity:{...(m.activity||{}),team:team(m.activity?.team)},events:(m.events||[]).map(e=>({...e,displayTeam:team(e.team)})),odds:{win:{selected:flip?one.away:one.home,draw:one.draw,opponent:flip?one.home:one.away},ah:{line:ah.line===null||ah.line===undefined?null:(flip?-Number(ah.line):Number(ah.line)),selected:flip?ah.away:ah.home,opponent:flip?ah.home:ah.away},ou}};
}

function render(){
  ensureUi();const m=selectedMatch();if(!m)return;selectedId=m.sourceMatchId;const x=orient(m),pitch=$('#pitch'),a=x.activity||{type:'POSSESSION',team:'SELECTED'},c=coords({type:a.type,team:a.team==='SELECTED'?'HOME':'AWAY'},m.minute),cls=activityClass(a.type);
  pitch.className=`pitch v2 ${c.selected?'selected-control':'opponent-control'} event-${cls}`;pitch.style.setProperty('--ball-x',`${c.x}%`);pitch.style.setProperty('--ball-y',`${c.y}%`);pitch.style.setProperty('--zone-x',`${c.selected?62:6}%`);
  $('#pitchSelected').querySelector('b').textContent=x.selected;$('#pitchOpponent').querySelector('b').textContent=x.opponent;
  const tag=$('#possessionTag');if(tag)tag.textContent=`${a.team==='SELECTED'?x.selected:x.opponent} · ${String(a.type||'POSSESSION').replaceAll('_',' ')}`;
  const badge=$('#liveEventBadge');badge.className=`live-event-badge ${cls}`;badge.querySelector('small').textContent=`${m.minute||'LIVE'}' · ${a.team||'LIVE'}`;badge.querySelector('b').textContent=`${eventIcon(a.type)} ${a.type||'POSSESSION'}`;
  $('#liveMarketStrip').innerHTML=`<span><small>1X2 SELECTED</small><b>${fmt(x.odds.win.selected)}</b></span><span><small>DRAW</small><b>${fmt(x.odds.win.draw)}</b></span><span><small>AH ${x.odds.ah.line===null?'—':`${x.odds.ah.line>=0?'+':''}${x.odds.ah.line}`}</small><b>${fmt(x.odds.ah.selected)} / ${fmt(x.odds.ah.opponent)}</b></span><span><small>O/U ${x.odds.ou.line??'—'}</small><b>${fmt(x.odds.ou.over)} / ${fmt(x.odds.ou.under)}</b></span>`;
  const events=x.events.slice(-18),markers=events.map(e=>{const left=Math.max(0,Math.min(100,(Number(e.minute)||0)/90*100));return `<span class="timeline-event ${String(e.displayTeam).toLowerCase()}" style="left:${left}%" title="${esc(e.minute)}' ${esc(e.type)}"><i>${eventIcon(e.type)}</i><small>${esc(e.minute)}'</small></span>`}).join('');
  $('#pitchTimeline').innerHTML=`<div class="timeline-labels"><span>0'</span><span>15'</span><span>30'</span><span>HT</span><span>60'</span><span>75'</span><span>90'</span></div><div class="timeline-track"><i class="timeline-now" style="left:${Math.max(0,Math.min(100,(Number(m.minute)||0)/90*100))}%"></i>${markers}</div>`;
  const oddsGrid=$('#oddsGrid');if(oddsGrid)oddsGrid.innerHTML=`<div class="odd-card"><small>1X2 SELECTED</small><b>${fmt(x.odds.win.selected)}</b></div><div class="odd-card"><small>DRAW / OPPONENT</small><b>${fmt(x.odds.win.draw)} / ${fmt(x.odds.win.opponent)}</b></div><div class="odd-card"><small>AH</small><b>${x.odds.ah.line===null?'—':`${x.odds.ah.line>=0?'+':''}${x.odds.ah.line}`} @ ${fmt(x.odds.ah.selected)}</b></div><div class="odd-card"><small>O/U ${x.odds.ou.line??'—'}</small><b>${fmt(x.odds.ou.over)} / ${fmt(x.odds.ou.under)}</b></div>`;
  const eventsBox=$('#events');if(eventsBox)eventsBox.innerHTML=events.length?events.map(e=>`<div class="event-row"><span>${eventIcon(e.type)}</span><b>${esc(e.minute??'—')}' · ${esc(e.type)}</b><small>${esc(e.displayTeam)}${e.detail?` · ${esc(e.detail)}`:''}</small></div>`).join(''):'<div class="footer-note">ยังไม่มี event row ที่ยืนยันจาก detail feed ในคู่นี้ · ภาพสนามยังตอบสนองจาก score/cards/corners/shots snapshot delta จริง</div>';
}

async function poll(){
  try{runtime=runtime||await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());latest=await fetch(`${runtime.workerUrl}/live?t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json());render();}catch(e){console.warn('CAR 3.1 animation v2',e);}
}
ensureUi();document.addEventListener('click',e=>{if(e.target.closest('.candidate'))setTimeout(render,80)});setInterval(()=>{if(latest)render()},2000);poll();setInterval(poll,15000);
