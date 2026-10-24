export const MINIMUM_PERCENTAGE_VOTES=20;

// Presentation threshold only. Counts and stored votes are never changed.
export function communityView(summary){
 const missing={available:false,display:'counts',total:null,values:['—','—','—'],percentages:null,note:'Community votes are temporarily unavailable.'};
 if(!summary||!Number.isSafeInteger(summary.total)||summary.total<0||!Array.isArray(summary.counts)||summary.counts.length!==3||summary.counts.some(n=>!Number.isSafeInteger(n)||n<0)||summary.counts.reduce((a,b)=>a+b,0)!==summary.total)return missing;
 const total=summary.total;
 if(total<MINIMUM_PERCENTAGE_VOTES)return{available:true,display:'counts',total,values:summary.counts.map(n=>n.toLocaleString('en')+(n===1?' vote':' votes')),percentages:null,note:total===0?'Be the first to vote.':'Collecting votes · '+total+'/'+MINIMUM_PERCENTAGE_VOTES};
 const raw=summary.counts.map(n=>n/total*100),percentages=raw.map(Math.floor),order=raw.map((n,i)=>({i,remainder:n-percentages[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let left=100-percentages.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)percentages[order[i%3].i]++;
 return{available:true,display:'percentages',total,values:percentages.map(n=>n+'%'),percentages,note:'Based on '+total.toLocaleString('en')+' votes.'};
}
