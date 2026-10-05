import { publicFile } from './production.mjs';

const st=JSON.parse(await publicFile('/api/engine/statistics','json'));
if(st?.ok!==true||!Array.isArray(st?.rows))throw new Error('STATISTICS_SHAPE');
const rows=st.rows;
const keys=[...new Set(rows.flatMap(r=>Object.keys(r||{})))].sort();
const oddsKeys=keys.filter(k=>/odd|price/i.test(k));
const nested={};
for(const r of rows.slice(0,50))for(const [k,v] of Object.entries(r||{}))if(v&&typeof v==='object'&&!Array.isArray(v)){const ks=Object.keys(v);const hit=ks.filter(x=>/odd|price/i.test(x));if(hit.length)nested[k]=[...new Set([...(nested[k]||[]),...hit])].sort()}
console.log('STATS_ROW_COUNT='+rows.length);
console.log('STATS_ROW_KEYS='+JSON.stringify(keys));
console.log('STATS_ODDS_KEYS='+JSON.stringify(oddsKeys));
console.log('STATS_NESTED_ODDS_KEYS='+JSON.stringify(nested));
for(let i=0;i<Math.min(rows.length,8);i++){
 const r=rows[i]||{};const sample={};
 for(const k of oddsKeys)sample[k]=r[k];
 for(const [k,ks] of Object.entries(nested))if(r[k]&&typeof r[k]==='object')sample[k]=Object.fromEntries(ks.map(x=>[x,r[k][x]]));
 console.log(`STATS_ODDS_SAMPLE_${i+1}=`+JSON.stringify(sample));
}
