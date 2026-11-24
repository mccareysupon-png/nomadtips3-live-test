// BALL46 PRE-MATCH TEST ONLY: 1X2+BTTS+priced O/U V2 TOTAL from persisted snapshots.
// Pure join: never regrade fixture histories, mutate ledgers, or call a provider.
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const fields=['total','pending','win','loss','push'];
function assertStats(s,label){
 if(!s||!fields.every(k=>count(s[k]))||s.total!==s.pending+s.win+s.loss+s.push)
  throw Error('BAD_PREMATCH_SNAPSHOT_'+label);
}
const sum=(a,b,k)=>n(a?.[k])+n(b?.[k]);
function combineStats(base,ou){
 assertStats(base,'1X2_BTTS');assertStats(ou,'OU_V2');
 const r={...base};
 for(const k of fields)r[k]=sum(base,ou,k);
 r.draw=r.push;
 r.settled=r.win+r.loss+r.push;
 r.units=Math.round((n(base.units)+n(ou.units))*1e8)/1e8;
 r.winRate=r.win+r.loss?100*r.win/(r.win+r.loss):null;
 r.pricedSettled=r.settled;
 r.ouIncluded=true;
 assertStats(r,'TOTAL_WITH_OU');return r;
}
function combineBook(base,ou,total){
 if(!base?.window||!ou?.window||base.window.businessDay!==ou.window.businessDay)
  throw Error('PREMATCH_COMBINED_LONDON_DAY_MISMATCH');
 const bw=base.settled??{},ow=ou.settled??{};
 const w=sum(bw,ow,'win'),l=sum(bw,ow,'loss'),p=sum(bw,ow,'push');
 return {...base,
  selected:{...base.selected,total:sum(base.selected,ou.selected,'total')},
  settled:{...bw,total:sum(bw,ow,'total'),win:w,loss:l,push:p,draw:p,
   units:Math.round(sum(bw,ow,'units')*1e8)/1e8,
   winRate:w+l?100*w/(w+l):null},
  carriedPending:total.pending,
  basis:'PERSISTED_SETTLED_AT_1X2_BTTS_OU_V2',
  source:'PREMATCH_ALL_THREE_MARKET_SNAPSHOTS',
  providerCalls:0};
}
const initialCarry=rows=>{
 const row=rows[0];
 return row&&typeof row.cumulativeUnits==='number'?
  n(row.cumulativeUnits)-n(row.netUnits):0;
};
function combineSeries(base,ou,window,days){
 const end=window.businessDay;
 const begin=new Date(Date.parse(end+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
 const valid=arr=>Array.isArray(arr)?arr.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date>=begin&&x.date<=end)
  .sort((a,b)=>a.date.localeCompare(b.date)):[];
 const a=valid(base),b=valid(ou);
 const aBy=new Map(a.map(x=>[x.date,x])),bBy=new Map(b.map(x=>[x.date,x]));
 const dates=[...new Set([...aBy.keys(),...bBy.keys()])].sort();
 let lastA=initialCarry(a),lastB=initialCarry(b);
 return dates.map(date=>{
  const x=aBy.get(date),y=bBy.get(date);
  if(x)lastA=typeof x.cumulativeUnits==='number'?x.cumulativeUnits:lastA+n(x.netUnits);
  if(y)lastB=typeof y.cumulativeUnits==='number'?y.cumulativeUnits:lastB+n(y.netUnits);
  const win=sum(x,y,'win'),loss=sum(x,y,'loss'),push=n(x?.push??x?.draw)+n(y?.push??y?.draw);
  return {date,
   selected:sum(x,y,'selected'),settled:sum(x,y,'settled'),
   win,loss,draw:push,push,
   netUnits:Math.round(sum(x,y,'netUnits')*1e8)/1e8,
   cumulativeUnits:Math.round((lastA+lastB)*1e8)/1e8,
   stakedUnits:sum(x,y,'settled'),
   winRate:win+loss?100*win/(win+loss):null
  };
 });
}
export function combinePrematchTotalSnapshots(registry,ou){
 if(!registry||!ou||!registry.markets||!registry.dailyBooks||!registry.dailySeries)
  throw Error('MISSING_PREMATCH_SNAPSHOTS');
 const {markets,dailyBooks,dailySeries}=registry;
 const a=markets['1X2'],b=markets.BTTS,oldTotal=markets.TOTAL;
 assertStats(a,'1X2');assertStats(b,'BTTS');assertStats(oldTotal,'OLD_TOTAL');
 for(const k of fields)if(oldTotal[k]!==a[k]+b[k])
  throw Error('ORIGINAL_PREMATCH_TOTAL_MISMATCH_'+k);
 if(Math.abs(n(oldTotal.units)-n(a.units)-n(b.units))>1e-6)
  throw Error('ORIGINAL_PREMATCH_TOTAL_UNITS_MISMATCH');
 const ouStats=ou.stats??null,all=combineStats(oldTotal,ouStats);
 const totalBook=combineBook(dailyBooks.TOTAL,ou.dailyBook,all);
 const unionSeries=combineSeries(dailySeries.TOTAL,ou.dailySeries,dailyBooks.TOTAL.window,registry.rangeDays??90);
 return {...registry,
  code:'B46_PREMATCH_TOTAL_PLUS_PRICED_OU_V2_TEST',
  legacyCode:registry.code,
  source:'PERSISTED_1X2_BTTS_REGISTRY_PLUS_OU_V2_SNAPSHOT',
  markets:{...markets,'O/U':ouStats,TOTAL:all},
  dailyBooks:{...dailyBooks,'O/U':ou.dailyBook,TOTAL:totalBook},
  dailySeries:{...dailySeries,'O/U':ou.dailySeries,TOTAL:unionSeries},
  legacyTotal:oldTotal,
  totalMarkets:['1X2','BTTS','O/U'],
  providerCalls:0,productionWrites:0,fullLedgerRecalculationOnRead:false
 };
}
export function appendPricedOuToPrematchAll(allLedger,ouRows,total){
 if(!allLedger||!Array.isArray(allLedger.rows)||!Array.isArray(ouRows))
  throw Error('BAD_PREMATCH_ALL_LEDGER_ROWS');
 const keys=new Set(allLedger.rows.map(r=>String(r.market)+'/'+String(r.fixture_id)));
 const joined=[...allLedger.rows];
 for(const item of ouRows){
  if(item.market!=='O/U'||!count(Number(item.fixture_id))||
    !['PENDING','WIN','LOSS','PUSH'].includes(item.status))
   throw Error('INVALID_PRICED_OU_TOTAL_ROW');
  const key='O/U/'+String(item.fixture_id);
  if(keys.has(key))continue;
  keys.add(key);joined.push(item);
 }
 joined.sort((a,b)=>n(a.kickoff)-n(b.kickoff)||n(a.picked_at)-n(b.picked_at)||
  String(a.market).localeCompare(String(b.market))||n(a.fixture_id)-n(b.fixture_id));
 if(joined.length>total.total)throw Error('PREMATCH_ALL_ROWS_EXCEED_TOTAL');
 return {...allLedger,rows:joined,stats:total,source:'PREMATCH_TOTAL_1X2_BTTS_PRICED_OU_V2',
  ouIncluded:true};
}
