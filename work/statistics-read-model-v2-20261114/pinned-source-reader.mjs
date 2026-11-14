// Private server-side reader. Requires content-revision fencing. Never calls a
// scan, provider, mutation or unpaged endpoint; never runs in a visitor browser.
import {projectLedgerRow} from './persisted-read-store.mjs';
import {ContentPublisher,verifyCompleteLedger} from './content-publisher.mjs';
import {dateMs} from './read-model.mjs';
const OBSERVED='b46:stat:read-v2:observed',DAY=86400000;
const check=(ok,message)=>{if(!ok)throw Error(message)};
function nextExpiry(rows,now){
 const london=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'});let expiry=Infinity;
 for(let h=(Math.floor(now/3600000)+1)*3600000;h<now+32*3600000;h+=3600000)if(london.format(new Date(h))==='06'){expiry=h;break}
 for(const r of rows)if(r.status==='SETTLED')for(const d of [7,30,90]){const at=dateMs(r.settledAt??r.createdAt)+d*DAY+1;if(at>now)expiry=Math.min(expiry,at)}
 return expiry;
}
export class PinnedSourceReader{
 constructor(store,engine,{registry,formulas,clock=()=>Date.now(),maxRetries=3,budgetMs=30000}={}){
  this.store=store;this.engine=engine;this.clock=clock;this.maxRetries=maxRetries;this.budgetMs=budgetMs;this.running=null;
  this.publisher=new ContentPublisher(store,{registry,formulas,clock});
 }
 async read(path){
  const u=new URL(path,'https://engine.internal');check(u.pathname==='/ledger-health'||u.pathname==='/statistics'&&u.searchParams.get('paged')==='1'&&u.searchParams.get('cursor')?.startsWith('stat:v2:row:'),'SOURCE_READ_PATH_DENIED');
  const response=await this.engine.fetch(new Request(u,{method:'GET',signal:AbortSignal.timeout(15000)}));
  if(response.status===409)throw Error('SOURCE_CHANGED');check(response.ok,'SOURCE_HTTP_'+response.status);
  const data=await response.json();check(data.ok,'SOURCE_NOT_OK');return data;
 }
 async refresh(){
  if(this.running)return this.running;const work=this.run();this.running=work;
  try{return await work}finally{if(this.running===work)this.running=null}
 }
 async run(){
  const start=this.clock();let error;
  for(let attempt=0;attempt<this.maxRetries;attempt++)try{
   const head=await this.read('/ledger-health'),revision=head.contentRevision;
   check(head.statisticsGenerationType==='CONTENT_REVISION_V1'&&Number.isSafeInteger(revision)&&revision>=0,'PINNED_SOURCE_REQUIRED');
   check(Number.isFinite(head.updatedAt)&&head.updatedAt>0&&head.updatedAt<=this.clock()+60000,'INVALID_SOURCE_TIME');
   const active=await this.store.active(),observed=await this.store.storage.get(OBSERVED);
   if(active&&observed?.revision===active.contentRevision&&observed.sourceRevision===revision&&observed.expiresAt>this.clock()){
    await this.store.storage.put(OBSERVED,{...observed,at:head.updatedAt,sourceError:null});return{ok:true,changed:false,contentRevision:active.contentRevision,sourceRevision:revision,sourcePages:0};
   }
   const rows=[],seen=new Set();let cursor='stat:v2:row:\uffff',pages=0;
   while(cursor){
    check(this.clock()-start<this.budgetMs,'SOURCE_TIME_BUDGET');check(pages<256&&!seen.has(cursor),'SOURCE_CURSOR_BUDGET');seen.add(cursor);
    const page=await this.read('/statistics?'+new URLSearchParams({paged:'1',cursor,limit:'500',generation:String(revision),consistency:'content-v1'}));
    check(page.statisticsContentRevision===revision&&Array.isArray(page.rows)&&page.rows.length<=500,'SOURCE_CHANGED');
    check(page.ledgerTotal===head.ledgerTotal&&page.total===head.settledTotal,'SOURCE_CHANGED');
    rows.push(...page.rows.map(projectLedgerRow));check(rows.length<=100000,'SOURCE_ROW_BUDGET');pages++;
    if(page.nextCursor)check(page.hasMore===true&&page.rows.length>0&&page.nextCursor.startsWith('stat:v2:row:'),'SOURCE_CURSOR_INVALID');
    else check(!page.hasMore,'SOURCE_CURSOR_MISSING');cursor=page.nextCursor;
   }
   const after=await this.read('/ledger-health');check(after.contentRevision===revision,'SOURCE_CHANGED');
   const meta={...head,total:head.settledTotal};verifyCompleteLedger(rows,meta);
   const derivedAt=this.clock(),result=await this.publisher.ingest(rows,meta);
   await this.store.storage.put(OBSERVED,{revision:result.contentRevision,at:after.updatedAt,sourceRevision:revision,expiresAt:nextExpiry(rows,derivedAt),sourceError:null});
   return{ok:true,...result,sourceRevision:revision,sourcePages:pages};
  }catch(e){error=e;if(e.message!=='SOURCE_CHANGED')break}
  const active=await this.store.active();if(active){const old=await this.store.storage.get(OBSERVED);await this.store.storage.put(OBSERVED,{...old,revision:active.contentRevision,at:old?.at??dateMs(active.asOf),sourceError:String(error.message||error)})}
  throw error;
 }
}
