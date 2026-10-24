(()=>{
'use strict';if(window.__B46_PREDICTION_V6)return;window.__B46_PREDICTION_V6=true;
const KIT_COLORS=Object.freeze(['green','blue','red','white','black','purple']);
const OUTCOMES=Object.freeze(['1','X','2']);
function percentages(values){
 if(!Array.isArray(values)||values.length!==3||values.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0))return null;
 const sum=values.reduce((a,b)=>a+b,0);if(!sum||!Number.isFinite(sum))return null;
 const raw=values.map(x=>100*x/sum),rounded=raw.map(Math.floor),order=raw.map((x,i)=>({i,fraction:x-rounded[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(let left=100-rounded.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)rounded[order[i%3].i]++;
 return rounded;
}
function jerseyPair(fixtureId){
 function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;}
 const id=String(fixtureId),home=hash('ball46-jersey-v6:'+id)%6,away=(home+1+hash('ball46-jersey-v6-away:'+id)%5)%6;
 return [KIT_COLORS[home],KIT_COLORS[away]];
}
function formModel(fixture,now=Date.now()){
 const unavailable=reason=>({available:false,reason,percentages:null});
 const history=fixture?.history,kickoff=Number(fixture?.kickoffAt)||Date.parse(fixture?.kickoffUtc||'');
 if(!history||history.verified!==true||history.completeLastFive!==true)return unavailable('Verified last-five results are not connected.');
 const provider=String(history.source||'').toLowerCase();
 if(!['5usd','5dollar','goaloo','gaoloo'].includes(provider)||!Number.isFinite(kickoff)||kickoff<=0)return unavailable('History source or match time is unverified.');
 const cutoff=Math.min(kickoff,now),asOf=Date.parse(history.reportedAt||'');
 if(!Number.isFinite(asOf)||asOf>now||asOf<cutoff-86400000)return unavailable('History report time is unverified or outdated.');
 const goals=v=>(typeof v==='number'||typeof v==='string'&&/^\d{1,2}$/.test(v))&&Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=99?Number(v):null;
 function records(side){
  const data=history[side],teamId=String(fixture?.[side]?.id??'');
  if(!teamId||String(data?.teamId??'')!==teamId||!Array.isArray(data.lastFive)||data.lastFive.length!==5)return null;
  const ids=new Set(),rows=[];
  for(const r of data.lastFive){const id=String(r.fixtureId??''),ended=typeof r.endedAt==='number'?r.endedAt:Date.parse(r.endedAt||''),gf=goals(r.gf),ga=goals(r.ga);
   if(!/^\d{4,18}$/.test(id)||id===String(fixture.fixtureId)||ids.has(id)||String(r.status).toUpperCase()!=='FT'||!Number.isFinite(ended)||ended<=0||ended>=cutoff||ended>asOf||gf===null||ga===null)return null;
   ids.add(id);rows.push({fixtureId:id,endedAt:ended,gf,ga});
  }
  return rows.sort((a,b)=>b.endedAt-a.endedAt);
 }
 const home=records('home'),away=records('away');if(!home||!away)return unavailable('Five verified completed matches per team are required.');
 const avg=(rows,key)=>rows.reduce((sum,r)=>sum+r[key],0)/5;
 const lh=Math.max(.1,Math.min(4,(avg(home,'gf')+avg(away,'ga'))/2)),la=Math.max(.1,Math.min(4,(avg(away,'gf')+avg(home,'ga'))/2));
 const p=(n,l)=>{let factorial=1;for(let i=2;i<=n;i++)factorial*=i;return Math.exp(-l)*l**n/factorial;},weights=[0,0,0];
 for(let h=0;h<=10;h++)for(let a=0;a<=10;a++)weights[h>a?0:h===a?1:2]+=p(h,lh)*p(a,la);
 return {available:true,source:history.source,asOf:history.reportedAt,cutoff,percentages:percentages(weights),homeResults:home,awayResults:away,method:'Independent Poisson estimate from verified last-five goals for/against; no audience votes, odds or live score.'};
}

const card=document.querySelector('[data-pv-version="6"]');if(!card)return;
const q=s=>card.querySelector(s),name=t=>String(t?.name??t??''),norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''),set=(el,text)=>{if(el&&el.textContent!==String(text))el.textContent=String(text)};
const rail=card.parentElement,anchor=document.createComment('prediction-v6-position');rail.insertBefore(anchor,card);
let fixture=null,id='',summary=null,busy=false,readSequence=0,requestAbort=null,lastRead=0,errorText='';
const allowed=f=>['scheduled','live','halftime','ht','inplay','in_play','upcoming'].includes(String(f?.boardState??'').toLowerCase());
function placement(){const body=document.querySelector('#b46gn-detail[aria-hidden="false"] [data-b46gn-detailbody]'),featured=body?.querySelector('.b46gn-featured');if(matchMedia('(max-width:760px)').matches&&featured){if(card.previousElementSibling!==featured)featured.after(card);}else if(card.parentElement!==rail)anchor.after(card);}
function find(){const dash=window.NOMAD343_DASHBOARD_V2;if(!dash?.getFixture)return null;const h=document.querySelector('[data-featured-home]')?.textContent?.trim(),a=document.querySelector('[data-featured-away]')?.textContent?.trim();if(!h||h==='—'||!a||a==='—')return null;const active=document.querySelector('.match-row.active[data-match-id]');if(active){const f=dash.getFixture(active.dataset.matchId);if(f&&norm(name(f.home))===norm(h)&&norm(name(f.away))===norm(a))return f;}for(const row of document.querySelectorAll('.match-row[data-match-id]')){const f=dash.getFixture(row.dataset.matchId);if(f&&norm(name(f.home))===norm(h)&&norm(name(f.away))===norm(a))return f;}return null;}
function bars(host,values){host.querySelectorAll('.pv-bar').forEach((r,i)=>{set(r.querySelector('b'),values?values[i]+'%':'—');const fill=r.querySelector('.pv-fill'),width=(values?values[i]:0)+'%';if(fill.style.width!==width)fill.style.width=width;});}
function render(){
 const f=fixture;set(q('[data-pv-home]'),f?name(f.home):'—');set(q('[data-pv-away]'),f?name(f.away):'—');
 const state=String(f?.boardState||'').toLowerCase(),live=['live','halftime','ht','inplay','in_play'].includes(state),finished=state==='finished';
 set(q('[data-pv-status]'),f?(live?'LIVE':finished?'FINISHED':'UPCOMING'):'SELECT MATCH');set(q('[data-pv-minute]'),live?(Number.isFinite(Number(f.minute))?f.minute+'′':'LIVE'):finished?'FULL TIME':f?.kickoffUtc?new Date(f.kickoffUtc).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—');
 const goals=f?.goals;set(q('[data-pv-score]'),goals&&goals.home!==null&&goals.away!==null&&goals.home!==undefined&&goals.away!==undefined?goals.home+' – '+goals.away:'—');
 if(id){const pair=jerseyPair(id);for(const [i,side]of['home','away'].entries()){const img=q('[data-pv-kit="'+side+'"]'),src='/prediction-v6/jersey-'+pair[i]+'-3d-v6.webp';if(img.getAttribute('src')!==src)img.src=src;img.alt=name(f[side])+' · '+pair[i]+' jersey';}}
 for(const b of card.querySelectorAll('[data-pv-vote]')){b.disabled=!id||!summary||busy||!allowed(f);b.setAttribute('aria-pressed',String(summary?.myPick===b.dataset.pvVote));}
 set(q('[data-pv-count]'),summary?summary.total.toLocaleString()+(summary.total===1?' vote':' votes'):'— votes');bars(q('[data-pv-audience]'),summary?.percentages||null);
 set(q('[data-pv-message]'),errorText||(busy?'Saving your vote…':!id?'Select a match to view votes.':!summary?'Loading community votes…':!allowed(f)?'Voting is closed for this match.':summary.myPick?'Your vote: '+summary.myPick+' · Change anytime.':summary.total===0?'Be the first to vote.':'Select your prediction.'));
 const model=formModel(f);q('[data-pv-model]').hidden=!model.available;q('[data-pv-form-message]').hidden=model.available;bars(q('[data-pv-model]'),model.percentages);
}
async function readVotes(){if(!id||busy)return;const target=id,sequence=++readSequence;requestAbort?.abort();const abort=new AbortController();requestAbort=abort;try{const r=await fetch('/api/prediction-vote?fixtureId='+encodeURIComponent(target),{credentials:'same-origin',cache:'no-store',signal:abort.signal}),j=await r.json();if(sequence!==readSequence||target!==id)return;if(!r.ok||!j.ok||String(j.fixtureId)!==id)throw Error(j.error||'VOTES_UNAVAILABLE');summary=j;errorText='';lastRead=Date.now();}catch(e){if(e.name==='AbortError'||sequence!==readSequence||target!==id)return;summary=null;errorText='Community votes are temporarily unavailable.';}render();}
card.addEventListener('click',async e=>{const b=e.target.closest('[data-pv-vote]');if(!b||b.disabled||busy||!id)return;const target=id;readSequence++;requestAbort?.abort();busy=true;errorText='';render();try{const r=await fetch('/api/prediction-vote',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureId:target,choice:b.dataset.pvVote})}),j=await r.json();if(target!==id)return;if(!r.ok||!j.ok||String(j.fixtureId)!==id)throw Error(r.status===429?'Please wait a moment before voting again.':r.status===409?'Voting is closed for this match.':'Vote could not be saved. Please try again.');summary=j;lastRead=Date.now();}catch(e){if(target===id)errorText=e.message;}finally{busy=false;render();if(target!==id)readVotes();}});
function sync(){placement();const next=find(),nextId=String(next?.fixtureId||'');fixture=next;if(nextId!==id){id=nextId;summary=null;errorText='';readSequence++;requestAbort?.abort();render();if(id)readVotes();}else render();}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sync()});};
const featured=document.querySelector('[data-featured]');if(featured)new MutationObserver(schedule).observe(featured,{childList:true,subtree:true,characterData:true});
const dialog=document.querySelector('#b46gn-detail');if(dialog)new MutationObserver(schedule).observe(dialog,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-hidden']});
addEventListener('resize',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden){schedule();if(Date.now()-lastRead>15000)readVotes();}});
setInterval(()=>{sync();if(!document.hidden&&card.getClientRects().length&&Date.now()-lastRead>30000)readVotes();},3000);sync();
})();
