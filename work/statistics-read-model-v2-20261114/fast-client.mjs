// TEST ONLY. Read-only progressive browser contract; never treats a 50-row page as a full Ledger.
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export class FastStatisticsClient{
 constructor(fetchJson,{ttlMs=10000,clock=()=>Date.now()}={}){this.fetchJson=fetchJson;this.ttlMs=ttlMs;this.clock=clock;this.summary=null;this.summaryAt=0;this.pending=null;this.sequence=0;this.pages=new Map();}
 async getSummary({force=false}={}){
  if(!force&&this.summary&&this.clock()-this.summaryAt<this.ttlMs)return this.summary;
  if(this.pending)return this.pending;
  const promise=(async()=>{const data=await this.fetchJson('/api/statistics/fast-summary');assert(data?.ok===true&&Number.isSafeInteger(data.contentRevision)&&Number.isSafeInteger(data.ledgerTotal)&&data.marketCounts?.all===data.ledgerTotal,'UNVERIFIED_SUMMARY');if(this.summary&&data.contentRevision<this.summary.contentRevision)throw Error('REGRESSION_SUMMARY');this.summary=Object.freeze(data);this.summaryAt=this.clock();return this.summary})();
  this.pending=promise;try{return await promise}catch(e){if(this.summary)return {...this.summary,stale:true,readError:String(e.message||e)};throw e}finally{if(this.pending===promise)this.pending=null}
 }
 cancel(){this.sequence++;}
 async open({market='all',variant='all',filter='all',page=1,rangeDays='all'}={}){
  const ticket=++this.sequence;
  for(let attempt=0;attempt<2;attempt++){
   const s=await this.getSummary({force:attempt===1});
   if(ticket!==this.sequence)return {cancelled:true};
   const query=new URLSearchParams({market,variant,filter,page:String(page),limit:'50',rangeDays:String(rangeDays),revision:String(s.contentRevision)});
   const url='/api/statistics/fast-view?'+query;
   let view;try{view=await this.fetchJson(url)}catch(e){if(this.summary)return{ok:false,stale:true,summary:this.summary,error:String(e.message||e)};throw e}
   if(ticket!==this.sequence)return{cancelled:true};
   if(view?.contentRevision!==s.contentRevision){this.summaryAt=0;continue}
   assert(view.ok===true&&view.rows?.length<=50&&view.totalRows>=view.rows.length&&view.metrics&&Array.isArray(view.chart),'INVALID_FAST_VIEW');
   // Page rows are only a display projection; summary and metrics remain complete.
   const value={ok:true,summary:s,view,stale:!!s.stale,revision:s.contentRevision};
   this.pages.set(JSON.stringify([market,variant,filter,page,rangeDays,s.contentRevision]),value);
   return value;
  }
  return {ok:false,stale:true,error:'REVISION_RACE_NO_MIXING'};
 }
}
