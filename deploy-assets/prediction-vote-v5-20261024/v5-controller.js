/* Browser controller: V5 */
(()=>{
 'use strict';if(window.__B46_V5_CARD)return;window.__B46_V5_CARD='20261024';
 const $=s=>document.querySelector(s);
 const safe=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
 const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
 const name=x=>String(x?.name??x??'');
 const active=f=>['live','halftime','ht','inplay','in_play'].includes(String(f?.boardState??'').toLowerCase());
 const state={id:'',f:null,summary:null,ready:false,busy:false,model:null,voter:''};
 const voteCard=$('[data-prediction-card]'),rail=voteCard?.parentElement,after=voteCard?.nextElementSibling;
 function placeCard(){
  if(!voteCard||!rail)return;
  const mobile=matchMedia('(max-width:760px)').matches;
  if(mobile){const board=$('[data-board-sections]');if(board?.parentElement&&voteCard.parentElement!==board.parentElement)board.parentElement.insertBefore(voteCard,board);}
  else if(voteCard.parentElement!==rail){if(after?.parentElement===rail)rail.insertBefore(voteCard,after);else rail.appendChild(voteCard);}
 }
 function find(){
  const dash=window.NOMAD343_DASHBOARD_V2;if(!dash?.getFixture)return null;
  const h=$('[data-featured-home]')?.textContent?.trim(),a=$('[data-featured-away]')?.textContent?.trim();
  if(!h||!a||h==='—'||a==='—')return null;
  for(const row of document.querySelectorAll('.match-row[data-match-id]')){
    if(!norm(row.textContent).includes(norm(h))||!norm(row.textContent).includes(norm(a)))continue;
    let f;try{f=dash.getFixture(row.dataset.matchId)}catch{}
    if(f&&norm(name(f.home))===norm(h)&&norm(name(f.away))===norm(a))return f;
  }
  return null;
 }
 function palette(id){
  let seed=21;for(const c of String(id))seed=(seed*31+c.charCodeAt(0))>>>0;
  const home=seed%6;return[home,(home+1+seed%5)%6];
 }
 function viewer(){
  if(state.voter)return state.voter;
  try{let x=localStorage.getItem('b46-prediction-v5-voter')||'';
    if(!/^[a-f0-9-]{36}$/.test(x)){x=crypto.randomUUID();localStorage.setItem('b46-prediction-v5-voter',x)}state.voter=x;
  }catch{}
  return state.voter;
 }
 function model(f){
  // Never manufacture pre-match history or use the current live score as \"past form\".
  const h=f?.history?.home?.lastFive,a=f?.history?.away?.lastFive;
  const valid=z=>Array.isArray(z)&&z.length>=5&&z.slice(0,5).every(x=>Number.isInteger(num(x.gf))&&Number.isInteger(num(x.ga))&&num(x.gf)>=0&&num(x.ga)>=0);
  if(!valid(h)||!valid(a))return null;
  const av=(r,k)=>r.slice(0,5).reduce((s,x)=>s+Number(x[k]),0)/5;
  const lh=Math.max(.1,Math.min(4,(av(h,'gf')+av(a,'ga'))/2)),la=Math.max(.1,Math.min(4,(av(a,'gf')+av(h,'ga'))/2));
  const fact=n=>n<=1?1:Array.from({length:n},(_,i)=>i+1).reduce((p,x)=>p*x,1);
  const p=(n,l)=>Math.exp(-l)*Math.pow(l,n)/fact(n),w=[0,0,0];
  for(let i=0;i<=10;i++)for(let j=0;j<=10;j++)w[i>j?0:i===j?1:2]+=p(i,lh)*p(j,la);
  return w;
 }
 function bars(vals,prefix){
  const sum=vals.reduce((a,b)=>a+b,0),raw=sum?vals.map(x=>100*x/sum):[0,0,0],ints=raw.map(Math.floor);
  let left=sum?100-ints.reduce((a,b)=>a+b,0):0;
  for(const k of raw.map((v,i)=>({i,d:v-ints[i]})).sort((a,b)=>b.d-a.d)){if(left-->0)ints[k.i]++;}
  for(let i=0;i<3;i++){
   const pct=$('#'+prefix+'num'+i),bar=$('#'+prefix+'bar'+i);
   if(pct)pct.textContent=sum?ints[i]+'%':'—';
   if(bar)bar.style.width=(sum?ints[i]:0)+'%';
  }
 }
 const style=document.createElement('style');
 style.id='b46-v5-runtime-styles';style.textContent=__V5_CSS__+'\n[data-prediction-card]{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:visible!important}[data-prediction-card]>.card-title{display:none!important}[data-prediction-card] [data-prediction-content]{margin:0!important;padding:0!important;background:transparent!important;border:0!important}[data-prediction-card] .b46-v5{width:100%}';
 document.head.appendChild(style);
 function mount(){
  const host=$('[data-prediction-content]');
  if(!host)return;
  host.classList.remove('locked');host.dataset.predictionOwner='b46-prediction-v5';
  host.innerHTML='<div class="b46-v5">'+__V5_TEMPLATE__+'</div>';
  const f=state.f;
  if(!f)return;
  const [a,b]=palette(state.id),score=f.goals||{},clock=num(f.minute);
  const jerseys=[$('#homeJersey'),$('#awayJersey')];
  jerseys[0].src='/b46-v5/jersey-'+a+'.png';jerseys[1].src='/b46-v5/jersey-'+b+'.png';
  jerseys[0].alt='Home shirt';jerseys[1].alt='Away shirt';
  const teamEls=host.querySelectorAll('.team-name');
  if(teamEls.length>=2){teamEls[0].textContent=name(f.home);teamEls[1].textContent=name(f.away);}
  const sub=host.querySelector('.subhead');if(sub)sub.textContent='Select 1 / X / 2 — real community voting';
  host.querySelectorAll('.score strong').forEach(x=>x.textContent=(num(score.home)??'—')+' – '+(num(score.away)??'—'));
  const clockEl=host.querySelector('.score span');if(clockEl)clockEl.textContent=(clock??'LIVE')+'′ · LIVE';
  host.querySelectorAll('[data-vote]').forEach(btn=>btn.addEventListener('click',()=>submit(['1','X','2'][Number(btn.dataset.vote)])));
  display();
 }
 function display(){
  const root=$('[data-prediction-card] .b46-v5');if(!root)return;
  const note=$('#voteNote'),total=$('#votesCount'),aud=$('#audienceBars'),formEl=root.querySelector('.model');
  if(!state.summary){
    if(aud)aud.innerHTML='<div class="b46-v5-empty">Waiting for community vote totals…</div>';
  }else{
    if(aud&&!aud.querySelector('.barrow'))aud.innerHTML='<div class="barrow"><span class="bar-label">1</span><div class="track"><div class="fill home" id="vbar0"></div></div><span class="percent" id="vnum0"></span></div><div class="barrow"><span class="bar-label">X</span><div class="track"><div class="fill draw" id="vbar1"></div></div><span class="percent" id="vnum1"></span></div><div class="barrow"><span class="bar-label">2</span><div class="track"><div class="fill away" id="vbar2"></div></div><span class="percent" id="vnum2"></span></div>';
    bars(state.summary.counts||[0,0,0],'v');
  }
  if(total)total.textContent=(state.summary?.total||0).toLocaleString('en-US')+' votes';
  if(note)note.textContent=state.ready?'Choose your outcome':'Community voting unavailable';
  if(formEl&&!state.model)formEl.innerHTML='<div class="section-label"><strong>FORM MODEL · LAST 5</strong><span>Data required</span></div><div class="b46-v5-empty">Awaiting verified last 5 match results</div>';
  if(state.model)bars(state.model,'f');
  root.querySelectorAll('[data-vote]').forEach(btn=>{
    const pick=['1','X','2'][Number(btn.dataset.vote)];
    btn.disabled=!state.ready||state.busy;
    btn.setAttribute('aria-pressed',String(state.summary?.myPick===pick));
  });
 }
 async function refresh(){
  if(!state.id)return;const id=state.id;
  try{const r=await fetch('/api/prediction-vote?fixtureId='+encodeURIComponent(id)+'&voterId='+encodeURIComponent(viewer()),{cache:'no-store'});
   if(!r.ok)throw Error('VOTE_FETCH_FAILED');const j=await r.json();
   if(!j.ok||id!==state.id)return;state.summary=j;state.ready=true;display();
  }catch{if(id===state.id){state.summary=null;state.ready=false;display()}}
 }
 async function submit(choice){
  if(!state.ready||!state.id||!viewer()||state.busy)return;
  const id=state.id;state.busy=true;display();const note=$('#voteNote');if(note)note.textContent='Saving vote…';
  try{
   const r=await fetch('/api/prediction-vote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureId:id,choice,voterId:viewer()})});
   const j=await r.json();if(!r.ok||!j.ok)throw Error('SAVE_FAILED');
   if(state.id===id){state.summary={...j,myPick:choice};state.ready=true;display();const n=$('#voteNote');if(n)n.textContent='✓ Vote saved · totals update shortly';}
  }catch{const n=$('#voteNote');if(n)n.textContent='Vote not saved · retry';}
  finally{state.busy=false;document.querySelectorAll('.b46-v5 [data-vote]').forEach(b=>b.disabled=!state.ready);}
 }
 let pollCount=0;
 function sync(){
  placeCard();
  const f=find(),id=active(f)?String(f.fixtureId??f.id??''):'';
  if(id!==state.id){state.id=id;state.f=id?f:null;state.ready=false;state.summary=null;state.model=id?model(f):null;
   if(id){mount();void refresh();}else{const host=$('[data-prediction-content]');if(host){host.innerHTML='<div class="b46-v5"><div class="b46-v5-empty">Choose an active match to vote on its outcome.</div></div>'}}
   return;
  }
  if(id){
   state.f=f;
   if(!$('.b46-v5 .prediction'))mount();
   const sc=f.goals||{},strong=$('.b46-v5 .score strong'),clock=$('.b46-v5 .score span');
   if(strong)strong.textContent=(num(sc.home)??'—')+' – '+(num(sc.away)??'—');
   if(clock)clock.textContent=(num(f.minute)??'LIVE')+'′ · LIVE';
  }
  if(++pollCount%12===0&&id)void refresh();
 }
 function start(){sync();setInterval(sync,2500)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();