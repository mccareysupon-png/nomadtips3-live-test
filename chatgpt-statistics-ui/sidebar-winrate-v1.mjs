// Sidebar Win Rate V1: read-only view of the existing materialized graph map.
// Never scans rows, changes Book state, or changes native chart Win Rate.
export const SIDEBAR_MARKETS=['all','AH','1X2','O/U','BTTS','Corners','Cards','Other'];
const outcomes=['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'];
export function sidebarWinRates(graphs){
 const byMarket={};
 for(const market of SIDEBAR_MARKETS){
  const g=graphs?.[market],c=g?.counts;
  if(!c||!outcomes.every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||outcomes.reduce((n,k)=>n+c[k],0)!==g.summary?.rows)throw Error('SIDEBAR_COUNTS_INVALID');
  const w=c.WIN+c.HALF_WIN,l=c.LOSS+c.HALF_LOSS;
  byMarket[market]={rate:w+l?w/(w+l)*100:null,settled:g.summary.rows};
 }
 for(const k of outcomes)if(SIDEBAR_MARKETS.slice(1).reduce((n,m)=>n+graphs[m].counts[k],0)!==graphs.all.counts[k])throw Error('SIDEBAR_MARKET_DRIFT');
 return byMarket;
}
export function validSidebar(v){
 return !!v&&Object.keys(v).length===8&&SIDEBAR_MARKETS.every(k=>{
  const x=v[k];return x&&Number.isSafeInteger(x.settled)&&x.settled>=0&&(x.rate===null||Number.isFinite(x.rate)&&x.rate>=0&&x.rate<=100);
 })&&SIDEBAR_MARKETS.slice(1).reduce((n,k)=>n+v[k].settled,0)===v.all.settled;
}
// Optional field: failure to produce sidebar must not break a valid graph.
export function optionalSidebar(graphs){try{return sidebarWinRates(graphs)}catch{return null}}
