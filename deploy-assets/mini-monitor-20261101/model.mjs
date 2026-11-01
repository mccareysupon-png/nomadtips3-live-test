/* Same market-implied probability calculation as current monitor. */
export function probabilities(f,now=Date.now()){
 if(!f||!['live','inplay','in_play','halftime','ht'].includes(String(f.boardState||f.status).toLowerCase())||f.providerOddsHeld)return null;
 const t=f.providerOddsFreshAt??f.providerOddsUpdatedAt,at=typeof t==='number'?t:Date.parse(t);
 if(!Number.isFinite(at)||now-at>120000||at-now>10000)return null;
 const o=f.providerOdds?.odds?.['1x2']?.inplay;if(!o)return null;
 const prices=[o.home,o.draw,o.away];if(!prices.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>1))return null;
 const inverse=prices.map(x=>1/x),total=inverse.reduce((a,b)=>a+b,0);if(!(total>.5&&total<1.6))return null;
 const values=inverse.map(x=>x/total*100),whole=values.map(Math.floor);let left=100-whole.reduce((a,b)=>a+b,0);const ranks=values.map((x,i)=>({i,r:x-whole[i]})).sort((a,b)=>b.r-a.r);for(let i=0;i<left;i++)whole[ranks[i].i]++;
 return{values,whole,at};
}
export class OutlookCache {
 constructor(storage=null){this.storage=storage;this.rows=new Map();try{const data=JSON.parse(storage?.getItem('b46-monitor-mini-v1')||'null');if(data?.version===1)for(const row of data.rows||[])if(typeof row.id==='string'&&Number.isFinite(row.at)&&row.values?.length===3&&row.values.every(v=>Number.isFinite(v)&&v>=0&&v<=100)&&Math.abs(row.values.reduce((a,b)=>a+b,0)-100)<.001&&row.whole?.length===3&&row.whole.every(v=>Number.isInteger(v)&&v>=0&&v<=100)&&row.whole.reduce((a,b)=>a+b,0)===100)this.rows.set(row.id,Object.freeze(row));}catch{}}
 save(){try{this.storage?.setItem('b46-monitor-mini-v1',JSON.stringify({version:1,rows:[...this.rows.values()]}))}catch{}}
 resolve(id,fixture,now=Date.now()){
  id=String(id||'');if(!id)return{state:'awaiting',model:null};
  const same=fixture&&String(fixture.fixtureId)===id;
  const candidate=same?probabilities(fixture,now):null;
  let saved=this.rows.get(id)||null;
  if(candidate&&(!saved||candidate.at>saved.at)){
   saved=Object.freeze({id,at:candidate.at,values:[...candidate.values],whole:[...candidate.whole]});this.rows.set(id,saved);this.save();
  }
  const finished=same&&['finished','ft','ended','cancelled','canceled','abandoned','postponed','suspended'].includes(String(fixture.boardState||fixture.status).toLowerCase());
  const current=!!(saved&&candidate&&candidate.at===saved.at&&JSON.stringify(candidate.whole)===JSON.stringify(saved.whole));
  return{state:finished?'ended':current?'live':saved?'saved':'awaiting',model:saved};
 }
}
