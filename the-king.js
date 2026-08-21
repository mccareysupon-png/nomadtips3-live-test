const FEED='./the-king-feed.json';
const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const money=(n)=>Number.isFinite(n)?`${n>=0?'+':''}฿${Math.abs(n).toFixed(0)}`:'—';
const pct=(n)=>Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
const odds=(n)=>Number.isFinite(n)?n.toFixed(2):'—';

$$('.king-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.king-tabs button').forEach(x=>x.classList.toggle('active',x===btn));
  $$('.king-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===btn.dataset.tab));
}));

function resultClass(r){return r==='WIN'?'win':r==='LOSS'?'loss':'pending'}
function rowPL(item){if(item.result==='WIN')return 100*(item.odds-1);if(item.result==='LOSS')return -100;return 0}

function render(data){
  const settled=(data.history||[]).filter(x=>x.result==='WIN'||x.result==='LOSS');
  const wins=settled.filter(x=>x.result==='WIN').length;
  const losses=settled.filter(x=>x.result==='LOSS').length;
  const avg=settled.length?settled.reduce((a,x)=>a+Number(x.odds||0),0)/settled.length:NaN;
  const net=settled.reduce((a,x)=>a+rowPL(x),0);
  const roi=settled.length?net/(settled.length*100):NaN;
  $('#sumPicks').textContent=settled.length;
  $('#sumWin').textContent=wins;
  $('#sumLoss').textContent=losses;
  $('#sumRate').textContent=pct(settled.length?wins/settled.length:NaN);
  $('#sumOdds').textContent=odds(avg);
  $('#sumNet').textContent=money(net);
  $('#sumRoi').textContent=pct(roi);
  $('#kingUpdated').textContent=data.updated_at?`Updated ${data.updated_at}`:'Verified feed';

  const today=data.today||[];
  $('#todayCount').textContent=`${today.length} pick${today.length===1?'':'s'}`;
  $('#todayEmpty').hidden=today.length>0;
  $('#todayRows').innerHTML=today.map(x=>`<tr><td>${x.home} <span class="king-vs">vs</span> ${x.away}</td><td>${x.pick}</td><td>${Math.round(x.confidence*100)}%</td><td>+${x.edge}</td><td>${odds(x.odds)}</td><td><span class="king-result ${resultClass(x.result||'PENDING')}">${x.result||'PENDING'}</span></td></tr>`).join('');

  $('#historyCount').textContent=`${settled.length} settled`;
  $('#historyRows').innerHTML=settled.slice().reverse().map(x=>{const pl=rowPL(x);return `<tr><td>${x.date}</td><td>${x.pick}</td><td>${odds(x.odds)}</td><td>${x.ft||'—'}</td><td><span class="king-result ${resultClass(x.result)}">${x.result}</span></td><td class="king-pl ${pl>=0?'positive':'negative'}">${money(pl)}</td></tr>`}).join('');

  const byDay=new Map();
  settled.forEach(x=>{const d=byDay.get(x.date)||{p:0,w:0,l:0,net:0};d.p++;d.w+=x.result==='WIN';d.l+=x.result==='LOSS';d.net+=rowPL(x);byDay.set(x.date,d)});
  $('#dailyRows').innerHTML=[...byDay.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([date,d])=>`<tr><td>${date}</td><td>${d.p}</td><td class="king-result win">${d.w}</td><td class="king-result loss">${d.l}</td><td>${pct(d.p?d.w/d.p:NaN)}</td><td class="king-pl ${d.net>=0?'positive':'negative'}">${money(d.net)}</td></tr>`).join('');
}

fetch(FEED,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('feed unavailable');return r.json()}).then(render).catch(()=>{
  $('#kingUpdated').textContent='Verified feed unavailable';
  $('#todayEmpty').hidden=false;
});
