 function detailFrom(f){
 const body=$('[data-b46gn-detailbody]');if(!body)return;
 const fid=String(f.id||'');body.dataset.b46gnv6Fixture=fid;
 const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const val=v=>valid(v)?String(v):'—';
 const pair=obj=>obj&&valid(obj.home)&&valid(obj.away)?val(obj.home)+'–'+val(obj.away):'—';
 const line=(key,value)=>'<div class="b46gnv6-fact"><small>'+esc(key)+'</small><strong>'+esc(value)+'</strong></div>';
 const status=String(f.kind||'').toLowerCase();
 const empty='<div class="b46gnv6-empty">No live data available for this match.</div>';
 function render(fixture){
  if(body.dataset.b46gnv6Fixture!==fid||!body.isConnected)return;
  const home=fixture?.home?.name||f.names[0]||'—',away=fixture?.away?.name||f.names[1]||'—';
  const goals=fixture?.goals;
  const score=goals?pair(goals):f.scores.join('–');
  const ht=goals&&valid(goals.halfHome)&&valid(goals.halfAway)?'HT '+val(goals.halfHome)+'–'+val(goals.halfAway):
     (f.el.querySelector('.half-score')?.textContent.trim()||'—');
  const corners=fixture?.corners?pair(fixture.corners):'—';
  const fmtCard=c=>c&&valid(c.yellow)&&valid(c.red)?val(c.yellow)+' Yellow / '+val(c.red)+' Red':'—';
  const cards=fmtCard(fixture?.cards?.home)+' · '+fmtCard(fixture?.cards?.away);
  const oddsAt=Number(fixture?.providerOddsFreshAt??fixture?.providerOddsUpdatedAt);
  const sec=oddsAt>0?Math.max(0,Math.round((Date.now()-oddsAt)/1000)):null;
  const oddsAge=sec===null?'—':sec<60?sec+'s':sec<3600?Math.floor(sec/60)+'m':Math.floor(sec/3600)+'h';
  const minute=fixture?.minute;
  const clock=status==='live'?(valid(minute)?val(minute)+"'":'LIVE'):(status==='finished'?'FT':status==='scheduled'?'UPCOMING':f.clock||'—');
  const league=fixture?.league?.name||f.league||'—';
  let output='<section class="b46gnv6" data-b46gnv6-content="'+esc(fid)+'">'+
   '<div class="b46gnv6-head"><span>MATCH DETAILS · LIVE</span><span class="b46gnv6-clock">'+esc(clock)+'</span></div>'+
   '<div class="b46gnv6-league">'+esc(league)+'</div>'+
   '<div class="b46gnv6-score"><div class="b46gnv6-side"><small>HOME</small><strong>'+esc(home)+'</strong></div>'+
   '<strong class="b46gnv6-scorebig">'+esc(score)+'</strong>'+
   '<div class="b46gnv6-side"><small>AWAY</small><strong>'+esc(away)+'</strong></div></div>'+
   '<div class="b46gnv6-title">MATCH FACTS <span>Home · Away</span></div>'+
   '<div class="b46gnv6-facts">'+line('HALF-TIME',ht)+line('CORNERS',corners)+line('CARDS H · A',cards)+line('ODDS AGE',oddsAge)+'</div>';
  const signalRows=Array.isArray(window.NOMAD343_DASHBOARD_V2?.getSignals?.())?window.NOMAD343_DASHBOARD_V2.getSignals():[];
  const signals=signalRows.filter(s=>String(s?.fixtureId??s?.id??'')===fid).slice(-6);
  const sigHtml=signals.map(s=>{
   const parts=[s.marketLabel||s.market||'SIGNAL',s.selection||s.providerLineSide||'',valid(s.line)?val(s.line):'',
    valid(s.odds)?'@'+Number(s.odds).toFixed(2):'',s.bookmaker||''].filter(Boolean).map(esc);
   return '<div class="b46gnv6-signal">'+parts.join(' · ')+'</div>';
  }).join('')||'<div class="b46gnv6-empty">No active signals for this match.</div>';
  output+='<div class="b46gnv6-title">ACTIVE SIGNALS <span>Selected match</span></div><div class="b46gnv6-signals">'+sigHtml+'</div>';
  const st=fixture?.statistics||{},rows=[
   ['shotsOnTarget','Shots on target'],['shotsOffTarget','Shots off target'],['corners','Corners'],
   ['attacks','Attacks'],['dangerousAttacks','Dangerous attacks'],['possession','Possession']
  ];
  const statHtml=rows.map(([key,label])=>{
   const x=key==='corners'?fixture?.corners:st[key];if(!x||!valid(x.home)||!valid(x.away))return '';
   const a=Number(x.home),b=Number(x.away),sum=Math.max(1,a+b);
   const wa=Math.max(0,Math.min(100,key==='possession'?a:a/sum*100));
   const wb=Math.max(0,Math.min(100,key==='possession'?b:b/sum*100));
   const suffix=key==='possession'?'%':'';
   return '<div class="b46gnv6-stat"><div class="b46gnv6-statlabel"><b>'+esc(val(a)+suffix)+'</b><span>'+esc(label)+'</span><b>'+esc(val(b)+suffix)+'</b></div>'+
    '<div class="b46gnv6-bars"><div><i style="width:'+Math.round(wa)+'%"></i></div><div><i style="width:'+Math.round(wb)+'%"></i></div></div></div>';
  }).filter(Boolean).join('')||'<div class="b46gnv6-empty">Waiting for match statistics.</div>';
  output+='<div class="b46gnv6-title">MATCH COMPARISON <span>Home · Away</span></div><div class="b46gnv6-comparison">'+statHtml+'</div>';
  const events=Array.isArray(fixture?.events)?fixture.events.filter(e=>valid(e.minute)).slice(-8).reverse():[];
  const eventsHtml=events.map(e=>'<div class="b46gnv6-event"><b>'+esc(val(e.minute)+"'")+'</b><span>'+esc(String(e.type||'event').replace(/_/g,' '))+' · '+esc(e.team==='home'?'home':e.team==='away'?'away':'match')+'</span></div>').join('')||
   '<div class="b46gnv6-empty">No recent event data available.</div>';
  output+='<div class="b46gnv6-title">RECENT EVENTS <span>Latest feed</span></div><div class="b46gnv6-events">'+eventsHtml+'</div>';
  const markets=$$('.market-cell',f.el);
  body.innerHTML=output+'</section>';
  if(markets.length){
   const target=body.querySelector('.b46gnv6');
   const title=document.createElement('div');title.className='b46gnv6-title';title.textContent='MARKET ODDS';target.appendChild(title);
   const prices=document.createElement('div');prices.className='b46gn-prices b46gnv6-existing-market';
   for(const market of markets){const slot=document.createElement('div');slot.appendChild(market.cloneNode(true));prices.appendChild(slot);}
   target.appendChild(prices);
  }
 }
 render(null); // only the selected source row, no copied FEATURED MATCH or invented values.
 fetch('/api/engine/board',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('BOARD_'+r.status);return r.json()})
 .then(data=>{const hit=Array.isArray(data.fixtures)?data.fixtures.find(x=>String(x.fixtureId??x.id??'')===fid):null;
  if(hit)render(hit);})
 .catch(()=>{ /* Retain genuine source-row fields; never display another fixture. */ });
 }
