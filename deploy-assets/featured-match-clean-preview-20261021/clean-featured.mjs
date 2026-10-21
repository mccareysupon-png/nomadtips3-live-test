export const FEATURED_PREVIEW_MARKER='b46-featured-clean-preview-v1-20261021';
export const FEATURED_PREVIEW_SCRIPT=String.raw`(function(){
'use strict';
if(window.__b46FeaturedCleanPreviewV1)return;
window.__b46FeaturedCleanPreviewV1=true;
let pc=null,mobile=null,last='',expanded=false,sourcePreviouslyHidden=false;
const q=(root,s)=>root?.querySelector(s);
const t=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function create(tag,cl,parent,value){const n=document.createElement(tag);if(cl)n.className=cl;if(value!=null)n.textContent=value;if(parent)parent.appendChild(n);return n}
function info(src){
 const league=q(src,'[data-featured-league]');const flag=q(league,'img');
 const facts=[...src.querySelectorAll('.feature-facts > div')].map(e=>({label:t(q(e,'span')),value:t(q(e,'b'))}));
 const stats=[...src.querySelectorAll('.feature-stats .stat-row')].map(e=>{
  const nums=[...e.querySelectorAll(':scope > b')];
  const tracks=[...e.querySelectorAll('.stat-track i')];
  return {home:t(nums[0]),name:t(q(e,':scope > span')),away:t(nums[1]),homePct:tracks[0]?.style.width||'0%',awayPct:tracks[1]?.style.width||'0%'};
 });
 const events=[...src.querySelectorAll('.feature-events .event-item')].map(e=>({minute:t(q(e,'time')),message:t(q(e,'span'))}));
 const signal=q(src,'[data-featured-signal]'),sigContent=t(signal);
 return{minute:t(q(src,'[data-featured-status]')),league:t(league),flagSrc:flag?.getAttribute('src')||'',
 home:t(q(src,'[data-featured-home]')),away:t(q(src,'[data-featured-away]')),score:t(q(src,'[data-featured-score]')),
 facts,stats,events,signal,sigContent};
}
function sampleFromScreenshot(){
 return {
  isSample:true,
  minute:"84'",
  league:'Brazil Serie B',
  flagSrc:'',
  home:'Londrina',
  away:'Cuiaba',
  score:'1–0',
  facts:[
   {label:'HALF-TIME',value:'HT 1–0'},
   {label:'CORNERS',value:'2–7'},
   {label:'CARDS H · A',value:'0 Yellow / 0 Red · 0 Yellow / 0 Red'},
   {label:'ODDS AGE',value:'40s'}
  ],
  stats:[
   {home:'2',name:'Shots on target',away:'7',homePct:'29%',awayPct:'100%'},
   {home:'10',name:'Shots off target',away:'15',homePct:'67%',awayPct:'100%'},
   {home:'2',name:'Corners',away:'7',homePct:'29%',awayPct:'100%'},
   {home:'66',name:'Attacks',away:'141',homePct:'47%',awayPct:'100%'},
   {home:'14',name:'Dangerous attacks',away:'72',homePct:'19%',awayPct:'100%'},
   {home:'36%',name:'Possession',away:'64%',homePct:'36%',awayPct:'64%'}
  ],
  events:[
   {minute:"84'",message:'corner · away'},
   {minute:"79'",message:'corner · away'},
   {minute:"79'",message:'substitution · home'},
   {minute:"74'",message:'corner · away'},
   {minute:"72'",message:'substitution · away'}
  ],
  sampleSignals:[
   {title:'OVER',market:'Goals OVER · Full Time',detail:"Line +1.50 · Pinnacle",time:"Signal 35' · Entry 1–0"},
   {title:'AWAY',market:'1X2 · Full Time',detail:'Bet365',time:"Signal 21' · Entry 0–0"}
  ],
  sigContent:'SAMPLE ONLY',
  signal:null
 };
}
function render(root,d,isMobile){
 const panel=create('article','b46fm',root);
 panel.setAttribute('aria-label','Featured match live data overview');
 const head=create('div','fm-header',panel);
 const main=create('div','fm-header-main',head);
 const ey=create('div','fm-eyebrow',main);
 create('span','fm-live-dot',ey);create('span','',ey,d.isSample?'FEATURED MATCH · DESIGN SAMPLE':'FEATURED MATCH');
 const league=create('div','fm-league',main);
 if(d.flagSrc){const f=create('img','',league);f.src=d.flagSrc;f.width=15;f.height=11;f.alt='';f.setAttribute('aria-hidden','true');}
 const l=create('span','',league,d.league||'League unavailable');l.title=d.league;
 create('span','fm-minute',head,d.minute||'—');
 const sc=create('div','fm-score',panel);
 const h=create('div','fm-team home',sc);create('span','fm-type',h,'HOME');const hn=create('strong','',h,d.home||'—');hn.title=d.home;
 create('strong','fm-score-number',sc,d.score||'–');
 const a=create('div','fm-team away',sc);create('span','fm-type',a,'AWAY');const an=create('strong','',a,d.away||'—');an.title=d.away;
 const facts=create('div','fm-facts',panel);
 for(const fact of d.facts){
  const card=create('div','fm-fact',facts);card.dataset.name=fact.label;
  create('span','',card,fact.label);
  const text=create('b','',card,fact.value);text.title=fact.value;
 }
 const signalSection=create('section','fm-section',panel);signalSection.dataset.section='signal';
 const sigTop=create('div','fm-section-top',signalSection);create('span','fm-caption',sigTop,'ACTIVE SIGNALS');
 const sigRoot=create('div','fm-signal-container',signalSection);
 if(d.isSample&&d.sampleSignals?.length){
  for(const sign of d.sampleSignals){
   const box=create('div','fm-signal fm-sample-signal',sigRoot);
   const top=create('div','fm-sample-signal-top',box);
   create('b','',top,sign.title);create('span','',top,sign.market);
   create('span','fm-sample-signal-detail',box,sign.detail);
   create('span','fm-sample-signal-meta',box,sign.time);
  }
 }else if(!d.sigContent)signalSection.hidden=true;
 else{
  const wrapper=create('div','fm-signal',sigRoot);
  const clone=d.signal.cloneNode(true);clone.removeAttribute('id');wrapper.appendChild(clone);
 }
 const statsSection=create('section','fm-section',panel);
 const stTop=create('div','fm-section-top',statsSection);
 create('span','fm-caption',stTop,'MATCH COMPARISON');
 const n=create('span','fm-inline-note',stTop,'Home · Away');
 const stats=create('div','fm-stats',statsSection);
 if(!d.stats.length)create('div','fm-empty',stats,'No match comparison available');
 else for(const row of d.stats){
  const div=create('div','fm-stat',stats);const info=create('div','fm-stat-info',div);
  create('b','',info,row.home||'—');create('span','fm-stat-name',info,row.name||'—');create('b','',info,row.away||'—');
  const bars=create('div','fm-bars',div);
  const homeTrack=create('div','fm-track home',bars);const homeFill=create('i','',homeTrack);homeFill.style.width=row.homePct;
  const awayTrack=create('div','fm-track away',bars);const awayFill=create('i','',awayTrack);awayFill.style.width=row.awayPct;
 }
 const events=create('section','fm-section',panel);
 const eventHead=create('div','fm-section-top',events);
 create('span','fm-caption',eventHead,'RECENT EVENTS');
 create('span','fm-inline-note',eventHead,d.events.length?d.events.length+' updates':'');
 const eventGrid=create('div','fm-events',events);
 if(!d.events.length)create('div','fm-empty',eventGrid,'No recent events');
 else{
  for(const row of d.events.slice(0,expanded?d.events.length:3)){
   const e=create('div','fm-event',eventGrid);
   create('time','',e,row.minute||'—');create('span','',e,row.message||'—');
  }
  if(d.events.length>3){
   const btn=create('button','fm-more',events,expanded?'Show fewer events ↑':'View all '+d.events.length+' events ↓');
   btn.type='button';btn.setAttribute('aria-expanded',expanded?'true':'false');
   btn.addEventListener('click',()=>{expanded=!expanded;last='';refresh()});
  }
 }
 return panel;
}
function attach(src){
 const desktopParent=src.parentElement;
 const mobileTarget=document.querySelector('.workspace.singlepage .workspace-stage')||document.querySelector('.workspace.singlepage');
 if(!desktopParent||!mobileTarget)return false;
 if(!pc||!pc.isConnected){pc=create('div','b46fm-preview-pc');src.insertAdjacentElement('beforebegin',pc);}
 if(!mobile||!mobile.isConnected){mobile=create('div','b46fm-preview-mobile');mobileTarget.insertAdjacentElement('afterbegin',mobile);}
 return true;
}
function refresh(){
 const src=document.querySelector('.featured-card[data-featured]');
 if(!src)return;
 const actual=info(src);
 const missing=!actual.home||actual.home==='—'||!actual.away||actual.away==='—'||!actual.score||actual.score==='—';
 const data=missing?sampleFromScreenshot():actual;
 if(!attach(src))return;
 const signature=[data.minute,data.league,data.home,data.away,data.score,
   data.facts.map(x=>x.label+':'+x.value).join('|'),
   data.stats.map(x=>[x.home,x.name,x.away,x.homePct,x.awayPct].join('/')).join('|'),
   data.events.map(x=>x.minute+x.message).join('|'),
   data.signal?.innerHTML||'',data.isSample?'SCREENSHOT_SAMPLE':'LIVE',expanded].join('\u001d');
 if(signature!==last||!pc.querySelector('.b46fm')||!mobile.querySelector('.b46fm')){
  pc.replaceChildren();mobile.replaceChildren();
  render(pc,data,false);render(mobile,data,true);
  last=signature;
 }
 src.classList.add('b46fm-source-hidden');
}
const start=()=>{refresh();setInterval(refresh,1250);window.addEventListener('resize',refresh,{passive:true})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;
