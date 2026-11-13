// Dependency-free client contract. Constructing a client never starts a request.
// The current site's consumers are not switched merely by importing this file.
export class LazyStatisticsClient {
 constructor({fetch,now=()=>Date.now(),cacheMs=10000}){this.fetch=fetch;this.now=now;this.cacheMs=cacheMs;this.visible=true;this.saved=null;this.receivedAt=0;this.inflight=null;this.historyController=null;}
 setVisible(value){this.visible=Boolean(value);if(!this.visible)this.cancelHistory();}
 cancelHistory(){this.historyController?.abort();this.historyController=null;}
 async summary({force=false}={}){
  if(!this.visible)return this.saved?{...this.saved,stale:true,reason:'HIDDEN'}:null;
  if(!force&&this.saved&&this.now()-this.receivedAt<this.cacheMs)return this.saved;
  if(this.inflight)return this.inflight;
  this.inflight=(async()=>{
   try{
    const r=await this.fetch('/api/statistics/summary',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw Error('SUMMARY_HTTP_'+r.status);
    const j=await r.json();
    if(!j.ok||!j.generation||!Number.isFinite(j.asOf)||!Number.isSafeInteger(j.summary?.ledgerTotal)||'rows'in j)throw Error('INVALID_SUMMARY');
    if(this.saved&&j.asOf<this.saved.asOf)throw Error('OLDER_SNAPSHOT');
    this.saved=j;this.receivedAt=this.now();return j;
   }catch(error){if(this.saved)return {...this.saved,stale:true,reason:String(error.message||error)};throw error;}
  })();
  try{return await this.inflight;}finally{this.inflight=null;}
 }
 async history({cursor,market}={}){
  if(!this.visible)return null;
  this.cancelHistory();const controller=new AbortController();this.historyController=controller;
  const q=new URLSearchParams({limit:'50'});if(cursor)q.set('cursor',cursor);if(market)q.set('market',market);
  const r=await this.fetch('/api/statistics/rows?'+q,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(controller.signal.aborted)throw Error('STALE_HISTORY_REQUEST');
  if(!r.ok)throw Error('HISTORY_HTTP_'+r.status);const j=await r.json();
  if(controller.signal.aborted)throw Error('STALE_HISTORY_REQUEST');
  if(!j.ok||!j.completeSource||!Number.isSafeInteger(j.total)||!Array.isArray(j.rows)||j.rows.length>50)throw Error('INVALID_HISTORY_PAGE');
  if(this.historyController===controller)this.historyController=null;
  return j;
 }
}
