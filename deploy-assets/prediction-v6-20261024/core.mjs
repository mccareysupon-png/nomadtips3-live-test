export const KIT_COLORS=Object.freeze(['green','blue','red','white','black','purple']);
export const OUTCOMES=Object.freeze(['1','X','2']);
export function percentages(values){
 if(!Array.isArray(values)||values.length!==3||values.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0))return null;
 const sum=values.reduce((a,b)=>a+b,0);if(!sum||!Number.isFinite(sum))return null;
 const raw=values.map(x=>100*x/sum),rounded=raw.map(Math.floor),order=raw.map((x,i)=>({i,fraction:x-rounded[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(let left=100-rounded.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)rounded[order[i%3].i]++;
 return rounded;
}
export function jerseyPair(fixtureId){
 function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;}
 const id=String(fixtureId),home=hash('ball46-jersey-v6:'+id)%6,away=(home+1+hash('ball46-jersey-v6-away:'+id)%5)%6;
 return [KIT_COLORS[home],KIT_COLORS[away]];
}
export function formModel(fixture,now=Date.now()){
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
