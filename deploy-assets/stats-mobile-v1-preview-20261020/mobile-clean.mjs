export const MOBILE_MARKER='b46-mobile-stats-clean-v1-20261020';
export const MOBILE_SCRIPT=String.raw`(function(){
 'use strict';
 if(window.__b46MobileStatsCleanV1Installed)return;
 window.__b46MobileStatsCleanV1Installed=true;
 const LIMIT=12,RESULT_SEL='.workspace.singlepage .sp-stats-content .sp-results';
 const cssShort=s=>String(s||'').replace(/\s+/g,' ').trim();
 const get=e=>cssShort(e?.textContent);
 let root=null,host=null,list=null,more=null,currentSig='',shown=LIMIT,expanded=new Set();
 function append(tag,cls,txt,parent,title){
   const e=document.createElement(tag);e.className=cls;
   if(txt!==undefined&&txt!==null)e.textContent=txt;
   if(title)e.title=title;
   if(parent)parent.appendChild(e);
   return e;
 }
 function remove(){
   if(root)root.classList.remove('b46m-stats-ready');
   if(host)host.remove();
   root=null;host=null;list=null;more=null;shown=LIMIT;currentSig='';expanded=new Set();
 }
 function rowsOf(ul){return [...ul.querySelectorAll('.sp-table tbody tr')].filter(tr=>tr.querySelectorAll(':scope > td').length>=10)}
 function rowData(tr,index){
   const c=[...tr.querySelectorAll(':scope > td')];
   const match=c[1]?.querySelector('.sp-match');
   const full=get(match?.querySelector('strong'))||get(c[1]);
   const league=get(match?.querySelector('small'));
   let teams=full.split(/\s+[—–]\s+/);
   if(teams.length<2)teams=full.split(/\s+vs\.?\s+/i);
   const home=teams[0]||full,away=teams.length>=2?teams.slice(1).join(' — '):'—';
   const entryTexts=[...c[7].querySelectorAll('span,small')].map(get).filter(Boolean);
   const entryScore=entryTexts[0]||get(c[7]).split(/ENTRY/i)[0].trim()||'—';
   const finalTexts=[...c[8].querySelectorAll('span,small')].map(get).filter(Boolean);
   const finalScore=finalTexts[0]||get(c[8]).split(/\s+FT/i)[0].trim()||'—';
   const state=get(c[9].querySelector('.sp-result'))||get(c[9]).split('·')[0]||'—';
   const color=/\bWIN\b/i.test(state)?'win':/\bLOSS\b/i.test(state)?'loss':/PENDING|UNSETTLED/i.test(state)?'pending':'neutral';
   const date=get(c[0]),market=get(c[2]),pick=get(c[3]),line=get(c[4]),odds=get(c[5]),bookmaker=get(c[6]),source=get(c[9].querySelector('.sp-result-source')),entry=get(c[7]),final=get(c[8]);
   return{index,date,league,home,away,market,pick,line,odds,bookmaker,source,entry,final,entryScore,finalScore,state,color};
 }
 function readableMarket(str){
   return str.replace(/\bFull Time\b/gi,'FT').replace(/\bHalf Time\b/gi,'HT');
 }
 function extraItem(parent,name,value,full=false){
   const cell=append('div','b46m-extra-item'+(full?' full':''),null,parent);
   append('label','',name,cell);
   append('span','',value||'—',cell);
 }
 function card(data){
   const c=append('article','b46m-hcard',null,list);c.dataset.index=String(data.index);
   if(expanded.has(data.index))c.dataset.expanded='true';
   const heading=append('div','b46m-hhead',null,c);
   append('span','b46m-league',data.league||'League —',heading,data.league);
   append('time','b46m-date',data.date,heading,data.date);
   const teams=append('div','b46m-teams',null,c);
   for(const [typ,name] of [['home',data.home],['away',data.away]]){
     const line=append('div','b46m-teamline',null,teams);
     append('span','b46m-teamtag'+(typ==='away'?' away':''),typ==='home'?'H':'A',line);
     append('span','b46m-teamname',name,line,name);
   }
   const pickbar=append('div','b46m-pickbar',null,c);
   const market=readableMarket(data.market);
   append('span','b46m-market',market||'Market —',pickbar,data.market);
   append('strong','b46m-odds',data.odds&&data.odds!=='—'?data.odds:'—',pickbar,'Odds '+data.odds);
   const foot=append('div','b46m-hfoot',null,c);
   const scores=append('div','b46m-scoreline',null,foot);
   append('span','', 'Entry',scores);
   append('strong','',data.entryScore||'—',scores);
   append('span','arrow','→',scores);
   append('strong','',data.finalScore||'—',scores);
   append('span','b46m-outcome '+data.color,data.state,foot);
   const button=append('button','b46m-detail-toggle',expanded.has(data.index)?'− Less details':'+ Match details',c);
   button.type='button';button.dataset.expand=String(data.index);button.setAttribute('aria-expanded',expanded.has(data.index)?'true':'false');
   const extra=append('div','b46m-extra',null,c);
   extraItem(extra,'Market',data.market);
   extraItem(extra,'Pick',data.pick);
   extraItem(extra,'Line',data.line);
   extraItem(extra,'Odds',data.odds);
   extraItem(extra,'Bookmaker / Referee',data.bookmaker,true);
   extraItem(extra,'Entry',data.entry,true);
   extraItem(extra,'Final',data.final,true);
   extraItem(extra,'Result source',data.source,true);
   return c;
 }
 function render(data){
   if(!list||!more)return;
   expanded=new Set([...expanded].filter(v=>v<data.length));
   list.replaceChildren();
   const max=Math.min(data.length,shown);
   for(const row of data.slice(0,max))card(row);
   more.hidden=max>=data.length;
   more.textContent='Show more · '+max+' / '+data.length;
   if(!data.length)append('div','b46m-history-empty','No records in the current view',list);
 }
 function install(next){
   root=next;
   host=append('div','b46m-history',null,null);
   host.setAttribute('aria-label','Settled Signal History in mobile card view');
   list=append('div','b46m-history-list',null,host);
   more=append('button','b46m-more',null,host);
   more.type='button';
   more.addEventListener('click',()=>{shown+=LIMIT;const rows=rowsOf(root).map(rowData);render(rows);});
   host.addEventListener('click',e=>{
     const button=e.target.closest('[data-expand]');
     if(!button||!host.contains(button))return;
     const index=Number(button.dataset.expand);
     if(expanded.has(index))expanded.delete(index);else expanded.add(index);
     const card=button.closest('.b46m-hcard');
     card.dataset.expanded=expanded.has(index)?'true':'false';
     button.setAttribute('aria-expanded',expanded.has(index)?'true':'false');
     button.textContent=expanded.has(index)?'− Less details':'+ Match details';
   });
   root.appendChild(host);
 }
 function tick(){
   const e=document.querySelector(RESULT_SEL);
   if(e!==root)remove();
   if(!e||!window.matchMedia('(max-width:767px)').matches){if(root)remove();return;}
   const table=e.querySelector('.sp-table');
   if(!table)return;
   const tr=rowsOf(e);
   if(!tr.length){if(root){root.classList.remove('b46m-stats-ready');host?.remove();root=null;host=null;list=null;more=null;}return;}
   if(!root)install(e);
   // Source table stays authoritative; digest catches updates, filters and pagination.
   const sig=tr.length+'|'+tr.map(x=>cssShort(x.textContent)).join('\u001f');
   if(sig!==currentSig){
     if(currentSig){shown=LIMIT;expanded.clear();}
     currentSig=sig;
     const data=tr.map(rowData);
     render(data);
   }
   e.classList.add('b46m-stats-ready');
 }
 const start=()=>{tick();setInterval(tick,1100);window.addEventListener('resize',tick,{passive:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;
