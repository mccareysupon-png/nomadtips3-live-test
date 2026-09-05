(()=>{
  'use strict';
  const root=document.querySelector('[data-p3-live-pitch]');
  if(!root)return;

  const $=sel=>root.querySelector(sel);
  const ball=$('[data-p3-ball]');
  const trail=$('[data-p3-trail]');
  const eventPin=$('[data-p3-event-pin]');
  const eventChip=$('[data-p3-event-chip]');
  const zoneHome=$('[data-zone-home]');
  const zoneAway=$('[data-zone-away]');
  const dangerHome=$('[data-danger-home]');
  const dangerAway=$('[data-danger-away]');
  const homeName=$('[data-home-name]');
  const awayName=$('[data-away-name]');
  const score=$('[data-score]');
  const clock=$('[data-clock]');
  const eventLine=$('[data-event-line]');
  const homeAttack=$('[data-home-attack]');
  const awayAttack=$('[data-away-attack]');
  const homePoss=$('[data-home-poss]');
  const awayPoss=$('[data-away-poss]');
  const homePossBar=$('[data-home-poss-bar]');
  const awayPossBar=$('[data-away-poss-bar]');

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const state={x:50,y:50,timer:null,eventTimer:null,events:[],demoIndex:0,demoRunning:false};
  const playerDots=[
    ['home',11,50],['home',21,32],['home',23,68],['home',37,44],['home',40,73],['home',49,28],
    ['away',89,50],['away',78,31],['away',77,69],['away',65,42],['away',62,73],['away',53,60],['ref',50,52]
  ];

  function drawPlayers(){
    const layer=$('[data-player-layer]');
    if(!layer||layer.children.length)return;
    playerDots.forEach(([team,x,y])=>{
      const el=document.createElement('span');
      el.className=`p3-player-dot ${team}`;
      el.style.left=`${x}%`;el.style.top=`${y}%`;
      layer.appendChild(el);
    });
  }

  function moveBall(x,y,duration=800){
    const nx=clamp(x,4.5,95.5),ny=clamp(y,5,95);
    const dx=nx-state.x,dy=ny-state.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    trail.style.left=`${state.x}%`;
    trail.style.top=`${state.y}%`;
    trail.style.width=`${Math.min(18,dist*.7)}%`;
    trail.style.transform=`rotate(${angle}deg)`;
    ball.style.transitionDuration=`${Math.max(160,duration)}ms`;
    trail.style.transitionDuration=`${Math.max(160,duration)}ms`;
    ball.style.left=`${nx}%`;ball.style.top=`${ny}%`;
    state.x=nx;state.y=ny;
  }

  function zone(side,type='attack',show=true){
    const target=type==='danger'?(side==='home'?dangerHome:dangerAway):(side==='home'?zoneHome:zoneAway);
    if(target)target.classList.toggle('show',!!show);
  }

  function clearZones(){[zoneHome,zoneAway,dangerHome,dangerAway].forEach(el=>el&&el.classList.remove('show'));}

  const eventIcons={goal:'G',shot:'S',corner:'C',card:'Y',red:'R',var:'V',sub:'↕',attack:'→',pass:'•'};
  function showEvent(evt={}){
    const type=evt.type||'attack';
    const label=evt.label||type.toUpperCase();
    const x=clamp(evt.x??state.x,5,95),y=clamp(evt.y??state.y,8,92);
    eventPin.className=`p3-event-pin ${type}`;
    eventPin.style.left=`${x}%`;eventPin.style.top=`${y}%`;
    eventChip.innerHTML=`<b>${esc(eventIcons[type]||'•')}</b><span>${esc(label)}</span>`;
    requestAnimationFrame(()=>eventPin.classList.add('show'));
    clearTimeout(state.eventTimer);
    state.eventTimer=setTimeout(()=>eventPin.classList.remove('show'),Math.max(1200,evt.hold||2200));
    pushEvent(label,evt.minute);
  }

  function pushEvent(label,minute){
    const text=`${minute?minute+"' · ":''}${label}`;
    state.events.unshift(text);
    state.events=state.events.slice(0,6);
    eventLine.innerHTML=state.events.map((row,i)=>`<span class="${i===0?'active':''}">${esc(row)}</span>`).join('');
  }

  function setStats(stats={}){
    const hp=clamp(stats.homePossession??52,0,100),ap=clamp(stats.awayPossession??100-hp,0,100);
    if(homePoss)homePoss.textContent=`${Math.round(hp)}%`;
    if(awayPoss)awayPoss.textContent=`${Math.round(ap)}%`;
    if(homePossBar)homePossBar.style.width=`${hp}%`;
    if(awayPossBar)awayPossBar.style.width=`${ap}%`;
    if(homeAttack)homeAttack.textContent=String(stats.homeAttacks??12);
    if(awayAttack)awayAttack.textContent=String(stats.awayAttacks??9);
  }

  function setSnapshot(snapshot={}){
    if(snapshot.home)homeName.textContent=snapshot.home;
    if(snapshot.away)awayName.textContent=snapshot.away;
    if(snapshot.score)score.textContent=snapshot.score;
    if(snapshot.clock)clock.textContent=snapshot.clock;
    if(snapshot.stats)setStats(snapshot.stats);
    if(snapshot.ball)moveBall(snapshot.ball.x,snapshot.ball.y,snapshot.ball.duration||700);
    if(snapshot.clearZones)clearZones();
    if(snapshot.zone)zone(snapshot.zone.side,snapshot.zone.type||'attack',snapshot.zone.show!==false);
    if(snapshot.event)showEvent(snapshot.event);
  }

  const demo=[
    {clock:'68:04',score:'1 — 0',ball:{x:39,y:59,duration:650},clearZones:true,zone:{side:'home',type:'attack'},event:{type:'pass',label:'Forward pass',x:39,y:59,minute:68},stats:{homePossession:55,awayPossession:45,homeAttacks:15,awayAttacks:10}},
    {clock:'68:12',ball:{x:51,y:52,duration:700},zone:{side:'home',type:'attack'},event:{type:'attack',label:'Home attack',x:54,y:50,minute:68}},
    {clock:'68:19',ball:{x:66,y:43,duration:760},zone:{side:'home',type:'danger'},event:{type:'attack',label:'Dangerous attack',x:67,y:42,minute:68},stats:{homePossession:56,awayPossession:44,homeAttacks:16,awayAttacks:10}},
    {clock:'68:24',ball:{x:82,y:47,duration:620},zone:{side:'home',type:'danger'},event:{type:'shot',label:'Shot',x:82,y:47,minute:68}},
    {clock:'68:28',ball:{x:92,y:50,duration:520},zone:{side:'home',type:'danger'},event:{type:'goal',label:'Goal area event',x:91,y:50,minute:68}},
    {clock:'71:02',ball:{x:94,y:10,duration:760},clearZones:true,event:{type:'corner',label:'Corner',x:94,y:10,minute:71},stats:{homePossession:57,awayPossession:43,homeAttacks:18,awayAttacks:11}},
    {clock:'72:16',ball:{x:57,y:35,duration:850},event:{type:'card',label:'Yellow card',x:58,y:34,minute:72}},
    {clock:'74:41',ball:{x:48,y:68,duration:780},event:{type:'sub',label:'Substitution',x:49,y:87,minute:74}},
    {clock:'77:08',ball:{x:70,y:62,duration:820},zone:{side:'home',type:'attack'},event:{type:'var',label:'VAR review',x:71,y:30,minute:77}},
    {clock:'79:20',ball:{x:46,y:52,duration:720},clearZones:true,event:{type:'red',label:'Red card',x:55,y:36,minute:79}}
  ];

  function demoTick(){
    if(!state.demoRunning)return;
    setSnapshot(demo[state.demoIndex%demo.length]);
    state.demoIndex=(state.demoIndex+1)%demo.length;
    state.timer=setTimeout(demoTick,2450);
  }
  function playDemo(){
    stopDemo();state.demoRunning=true;state.demoIndex=0;pushEvent('Visual demo started');demoTick();
  }
  function stopDemo(){
    state.demoRunning=false;clearTimeout(state.timer);clearTimeout(state.eventTimer);clearZones();eventPin.classList.remove('show');
  }

  drawPlayers();
  setStats({homePossession:55,awayPossession:45,homeAttacks:15,awayAttacks:10});
  window.NOMAD_P3_PITCH={setSnapshot,moveBall,showEvent,setStats,zone,clearZones,playDemo,stopDemo};
  playDemo();
})();
