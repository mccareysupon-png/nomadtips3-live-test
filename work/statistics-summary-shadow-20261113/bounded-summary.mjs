// Read-only reduction. Keeps one source page, two daily buckets and four slim
// settled rows. No Engine writes, provider requests, scheduler, or row cache.
export const generation=m=>JSON.stringify([m.ledgerTotal,m.total??m.settledTotal,m.pending,m.unresolved,m.win,m.loss,m.push,m.halfWin,m.halfLoss,m.ledgerUpdatedAt??m.updatedAt,m.byMarket]);
const check=(ok,message)=>{if(!ok)throw Error(message)};
const recentFields=['id','status','result','settledAt','createdAt','fixtureId','home','away','league','finalScore','market','marketLabel','selection','line','selectionLine','odds'];
const resultFields={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
export async function reduceBounded(read,formulas,registry,{now=Date.now(),budgetMs=25000}={}){
 const started=Date.now(),before=await read('/ledger-health'),sig=generation(before);
 check(Number.isSafeInteger(before.ledgerTotal)&&before.ledgerTotal>=0,'SOURCE_COUNTERS');
 const tk=formulas.sportDay(now),yk=formulas.prev(tk),daily={today:formulas.bucket(),yesterday:formulas.bucket(),tk,yk};
 const marketCounts={all:0,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};
 const actual={ledgerTotal:0,settledTotal:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0},byMarket={};
 const recentSettled=[];let firstDay=null,lastDay=null,pages=0,maxPageRows=0,cursor='stat:v2:row:\uffff';const seenCursors=new Set();const pinned=String(before.updatedAt);
 const bangkok=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
 for(;;){
  check(Date.now()-started<budgetMs,'SUMMARY_TIME_BUDGET');check(pages<256,'SUMMARY_PAGE_BUDGET');
  check(!seenCursors.has(cursor),'CURSOR_LOOP');seenCursors.add(cursor);
  const page=await read('/statistics?'+new URLSearchParams({paged:'1',cursor,limit:'2000',generation:pinned}));pages++;
  check(String(page.statisticsGeneration??page.ledgerUpdatedAt)===pinned,'SOURCE_CHANGED');check(generation(page)===sig,'SOURCE_CHANGED');check(Array.isArray(page.rows)&&page.rows.length<=2000,'UNBOUNDED_PAGE');maxPageRows=Math.max(maxPageRows,page.rows.length);
  for(const row of page.rows){
   check(typeof row.id==='string'&&row.id.length>0,'ROW_ID');actual.ledgerTotal++;marketCounts.all++;
   const family=registry.familyOf(row);check(Object.hasOwn(marketCounts,family)&&family!=='all','MARKET_FAMILY');marketCounts[family]++;
   const status=String(row.status||'').toUpperCase();
   if(status==='PENDING')actual.pending++;if(status==='UNRESOLVED')actual.unresolved++;
   if(status==='SETTLED'){
    const key=resultFields[row.result];check(key,'SETTLED_RESULT');actual.settledTotal++;actual[key]++;byMarket[row.market]=(byMarket[row.market]||0)+1;
    const at=Number(row.settledAt??row.createdAt);check(Number.isFinite(at)&&at>0,'SETTLED_TIME');const day=bangkok.format(new Date(at));if(firstDay===null||day<firstDay)firstDay=day;if(lastDay===null||day>lastDay)lastDay=day;
    const small=Object.fromEntries(recentFields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));recentSettled.push(small);recentSettled.sort((a,b)=>Number(b.settledAt??b.createdAt)-Number(a.settledAt??a.createdAt));recentSettled.length=Math.min(4,recentSettled.length);
   }
   const at=formulas.createdStamp(row);if(at===null)continue;const day=formulas.sportDay(at);if(day!==tk&&day!==yk)continue;
   const o=formulas.outcome(row),b=day===tk?daily.today:daily.yesterday;if(o)formulas.addSettled(b,row,o);else if(day===tk&&formulas.isPending(row)){b.pending++;formulas.addOdds(b,row);}
  }
  if(!page.nextCursor){check(!page.hasMore,'MISSING_CURSOR');break;}
  check(page.hasMore===true&&page.rows.length>0&&String(page.nextCursor).startsWith('stat:v2:row:'),'INVALID_CONTINUATION');cursor=page.nextCursor;
 }
 check(generation(await read('/ledger-health'))===sig,'SOURCE_CHANGED');
 for(const [k,v] of Object.entries(actual))check(v===before[k],'COUNTS_MISMATCH:'+k);
 for(const k of new Set([...Object.keys(byMarket),...Object.keys(before.byMarket||{})]))check((byMarket[k]||0)===(before.byMarket?.[k]||0),'MARKET_MISMATCH:'+k);
 const asOf=Number(before.updatedAt);check(Number.isFinite(asOf)&&asOf>0&&asOf<=now+60000,'SOURCE_TIME');
 const markets=Object.fromEntries(Object.keys(byMarket).map(key=>[key,{kind:registry.definitions[key]?.kind,label:registry.definitions[key]?.label}]));
 const data={ok:true,mode:'LIVE_SUMMARY',stale:now-asOf>90000,asOf,ledgerTotal:before.ledgerTotal,total:before.settledTotal,byMarket:before.byMarket,markets,marketCounts,daily,settledDays:firstDay?Math.max(1,Math.round((Date.parse(lastDay)-Date.parse(firstDay))/86400000)+1):null,recentSettled};
 check(JSON.stringify(data).length<24000,'SUMMARY_PAYLOAD_BUDGET');
 return {data,signature:sig,proof:{pages,maxPageRows,rows:actual.ledgerTotal,sourceWrites:0,providerRequests:0}};
}
