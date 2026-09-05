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
  const flowBars=$('[data-flow-bars]');
  const homeAttack=$('[data-home-attack]');
  const awayAttack=$('[data-away-attack]');
  const homeDanger=$('[data-home-danger]');
  const awayDanger=$('[data-away-danger]');
  const homeShots=$('[data-home-shots]');
  const awayShots=$('[data-away-shots]');
  const homePoss=$('[data-home-poss]');
  const awayPoss=$('[data-away-poss]');
  const homeAttackBar=$('[data-home-attack-bar]');
  const awayAttackBar=$('[data-away-attack-bar]');
  const homeDangerBar=$('[data-home-danger-bar]');
  const awayDangerBar=$('[data-away-danger-bar]');
  const homeShotsBar=$('[data-home-shots-bar]');
  const awayShotsBar=$('[data-away-shots-bar]');
  const homePossBar=$('[data-home-poss-bar]');
  const awayPossBar=$('[data-away-poss-bar]');

  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pct=(a,b)=>{
    const x=Math.max(0,Number(a)||0),y=Math.max(0,Number(b)||0),sum=x+y;
    return sum?Math.round(x/sum*100):50;
  };

  const state={x:50,y:50,timer:null,eventTimer:null,events:[],demoIndex:0,demoRunning:false,players:[],flow:[]};
  const defaultPlayers=[
    {team:'home',number:1,role:'gk',x:9,y:50},
    {team:'home',number:2,x:20,y:24},{team:'home',number:5,x:21,y:41},{team:'home',number:6,x:21,y:59},{team:'home',number:3,x:20,y:76},
    {team:'home',number:8,x:37,y:32},{team:'home',number:10,x:39,y:50},{team:'home',number:7,x:37,y:68},
    {team:'home',number:11,x:52,y:24},{team:'home',number:9,x:55,y:50},{team:'home',number:14,x:52,y:76},
    {team:'away',number:1,role:'gk',x:91,y:50},
    {team:'away',number:2,x:80,y:24},{team:'away',number:5,x:79,y:41},{team:'away',number:6,x:79,y:59},{team:'away',number:3,x:80,y:76},
    {team:'away',number:8,x:63,y:32},{team:'away',number:10,x:61,y:50},{team:'away',number:7,x:63,y:68},
    {team:'away',number:11,x:48,y:18},{team:'away',number:9,x:45,y:44},{team:'away',number:14,x:48,y:82},
    {team:'ref',number:'R',x:50,y:58}
  ];

  function renderPlayers(players=defaultPlayers){
    const layer=$('[data-player-layer]');
    if(!layer)return;
    state.players=Array.isArray(players)&&players.length?players:defaultPlayers;
    layer.innerHTML='';
    state.players.forEach(player=>{
      const el=document.createElement('span');
      const team=player.team==='away'?'away':player.team==='ref'?'ref':'home';
      el.className=`p3-player-dot ${team}${player.role==='gk'?' goalie':''}`;
      el.style.left=`${clamp(player.x,5,95)}%`;
      el.style.top=`${clamp(player.y,7,93)}%`;
      el.dataset.number=String(player.number??'');
      el.textContent=String(player.number??'');
      el.setAttribute('aria-hidden','true');
      layer.appendChild(el);
    });
  }

  function moveBall(x,y,duration=800){
    if(!ball||!trail)return;
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
    if(!eventPin||!eventChip)return;
    const type=evt.type||'attack';
    const label=evt.label||type.toUpperCase();
    const x=clamp(evt.x??state.x,5,95),y=clamp(evt.y??state.y,8,92);
    eventPin.className=`p3-event-pin ${type}`;
    eventPin.style.left=`${x}%`;eventPin.style.top=`${y}%`;
    eventChip.innerHTML=`<b>${esc(eventIcons[type]||'•')}</b><span>${esc(label)}</span>`;
    requestAnimationFrame(()=>eventPin.classList.add('show'));
    clearTimeout(state.eventTimer);
    state.eventTimer=setTimeout(()=>eventPin.classList.remove('show'),Math.max(1200,evt.hold||2200));
    pushEvent(label,evt.minute,evt.side||(x>=50?'home':'away'),type);
  }

  function renderFlow(){
    if(!flowBars)return;
    flowBars.innerHTML=state.flow.map(item=>`<i class="${item.side}" style="--h:${item.height}%" aria-hidden="true"></i>`).join('');
  }

  function pushFlow(side='home',type='attack'){
    const base={goal:96,shot:82,corner:66,attack:58,pass:34,card:30,red:44,var:38,sub:24}[type]||36;
    state.flow.push({side:side==='away'?'away':'home',height:clamp(base+(state.flow.length%5)*4,18,100)});
    state.flow=state.flow.slice(-42);
    renderFlow();
  }

  function seedFlow(){
    if(state.flow.length)return;
    for(let i=0;i<36;i++)state.flow.push({side:i%5===0||i%7===0?'away':'home',height:18+((i*17)%48)});
    renderFlow();
  }

  function pushEvent(label,minute,side='home',type='attack'){
    const text=`${minute?minute+"' · ":''}${label}`;
    state.events.unshift(text);
    state.events=state.events.slice(0,6);
    if(eventLine)eventLine.innerHTML=state.events.map((row,i)=>`<span class="${i===0?'active':''}">${esc(row)}</span>`).join('');
    pushFlow(side,type);
  }

  function setPair(homeEl,awayEl,homeBar,awayBar,homeValue,awayValue,suffix=''){
    const hv=Math.max(0,Number(homeValue)||0),av=Math.max(0,Number(awayValue)||0),hp=pct(hv,av);
    if(homeEl)homeEl.textContent=`${Math.round(hv)}${suffix}`;
    if(awayEl)awayEl.textContent=`${Math.round(av)}${suffix}`;
    if(homeBar)homeBar.style.width=`${hp}%`;
    if(awayBar)awayBar.style.width=`${100-hp}%`;
  }

  function setStats(stats={}){
    const hp=clamp(stats.homePossession??62,0,100),ap=clamp(stats.awayPossession??100-hp,0,100);
    const ha=stats.homeAttacks??48,aa=stats.awayAttacks??32;
    const hd=stats.homeDangerousAttacks??28,ad=stats.awayDangerousAttacks??14;
    const hs=stats.homeShots??6,as=stats.awayShots??3;
    setPair(homeAttack,awayAttack,homeAttackBar,awayAttackBar,ha,aa);
    setPair(homeDanger,awayDanger,homeDangerBar,awayDangerBar,hd,ad);
    setPair(homeShots,awayShots,homeShotsBar,awayShotsBar,hs,as);
    if(homePoss)homePoss.textContent=`${Math.round(hp)}%`;
    if(awayPoss)awayPoss.textContent=`${Math.round(ap)}%`;
    if(homePossBar)homePossBar.style.width=`${hp}%`;
    if(awayPossBar)awayPossBar.style.width=`${ap}%`;
  }

  function setSnapshot(snapshot={}){
    if(snapshot.home&&homeName)homeName.textContent=snapshot.home;
    if(snapshot.away&&awayName)awayName.textContent=snapshot.away;
    if(snapshot.score&&score)score.textContent=snapshot.score;
    if(snapshot.clock&&clock)clock.textContent=snapshot.clock;
    if(snapshot.players)renderPlayers(snapshot.players);
    if(snapshot.stats)setStats(snapshot.stats);
    if(snapshot.ball)moveBall(snapshot.ball.x,snapshot.ball.y,snapshot.ball.duration||700);
    if(snapshot.clearZones)clearZones();
    if(snapshot.zone)zone(snapshot.zone.side,snapshot.zone.type||'attack',snapshot.zone.show!==false);
    if(snapshot.event)showEvent(snapshot.event);
  }

  const demo=[
    {clock:'67:24',score:'1 — 0',ball:{x:56,y:27,duration:650},clearZones:true,zone:{side:'home',type:'attack'},event:{type:'pass',side:'home',label:'Forward pass',x:56,y:27,minute:67},stats:{homePossession:62,awayPossession:38,homeAttacks:48,awayAttacks:32,homeDangerousAttacks:28,awayDangerousAttacks:14,homeShots:6,awayShots:3}},
    {clock:'67:32',ball:{x:67,y:32,duration:700},zone:{side:'home',type:'attack'},event:{type:'attack',side:'home',label:'Home attack',x:68,y:31,minute:67}},
    {clock:'67:39',ball:{x:76,y:40,duration:760},zone:{side:'home',type:'danger'},event:{type:'attack',side:'home',label:'Dangerous attack',x:77,y:40,minute:67},stats:{homePossession:63,awayPossession:37,homeAttacks:49,awayAttacks:32,homeDangerousAttacks:29,awayDangerousAttacks:14,homeShots:6,awayShots:3}},
    {clock:'67:44',ball:{x:84,y:47,duration:620},zone:{side:'home',type:'danger'},event:{type:'shot',side:'home',label:'Shot',x:84,y:47,minute:67},stats:{homePossession:63,awayPossession:37,homeAttacks:49,awayAttacks:32,homeDangerousAttacks:29,awayDangerousAttacks:14,homeShots:7,awayShots:3}},
    {clock:'67:48',ball:{x:92,y:50,duration:520},zone:{side:'home',type:'danger'},event:{type:'goal',side:'home',label:'Goal area event',x:91,y:50,minute:67}},
    {clock:'70:02',ball:{x:94,y:10,duration:760},clearZones:true,event:{type:'corner',side:'home',label:'Corner',x:94,y:10,minute:70},stats:{homePossession:64,awayPossession:36,homeAttacks:51,awayAttacks:33,homeDangerousAttacks:30,awayDangerousAttacks:15,homeShots:7,awayShots:3}},
    {clock:'71:16',ball:{x:57,y:35,duration:850},event:{type:'card',side:'away',label:'Yellow card',x:58,y:34,minute:71}},
    {clock:'73:41',ball:{x:48,y:68,duration:780},event:{type:'sub',side:'away',label:'Substitution',x:49,y:87,minute:73}},
    {clock:'76:08',ball:{x:70,y:62,duration:820},zone:{side:'home',type:'attack'},event:{type:'var',side:'home',label:'VAR review',x:71,y:30,minute:76}},
    {clock:'78:20',ball:{x:46,y:52,duration:720},clearZones:true,event:{type:'red',side:'away',label:'Red card',x:55,y:36,minute:78}}
  ];

  function demoTick(){
    if(!state.demoRunning)return;
    setSnapshot(demo[state.demoIndex%demo.length]);
    state.demoIndex=(state.demoIndex+1)%demo.length;
    state.timer=setTimeout(demoTick,2450);
  }
  function playDemo(){
    stopDemo();state.demoRunning=true;state.demoIndex=0;pushEvent('Visual demo started',null,'home','pass');demoTick();
  }
  function stopDemo(){
    state.demoRunning=false;clearTimeout(state.timer);clearTimeout(state.eventTimer);clearZones();if(eventPin)eventPin.classList.remove('show');
  }

  renderPlayers();
  seedFlow();
  setStats({homePossession:62,awayPossession:38,homeAttacks:48,awayAttacks:32,homeDangerousAttacks:28,awayDangerousAttacks:14,homeShots:6,awayShots:3});
  window.NOMAD_P3_PITCH={setSnapshot,moveBall,showEvent,setStats,setPlayers:renderPlayers,zone,clearZones,playDemo,stopDemo};
  playDemo();
})();
