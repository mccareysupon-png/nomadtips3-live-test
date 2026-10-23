/* BALL46 form5 isolated Engine343 DO extension.
   Operational safety: disabled by default; when enabled: low-rate,
   prediction prior to kickoff only, immutable pick, no synthetic odds,
   idempotent long-term ledger insertion, FT results only.
*/
import{evaluateBTTSForm5,settleBTTSForm5}from'./form5.mjs';
import{form5LedgerRow}from'./ledger-adapter.mjs';
const K='b46:form5:v1:',FORM5_RULE='B46_BTTS_FORM5_V1';
const CYCLE_MS=15*60*1000,HISTORY_TTL_MS=6*60*60*1000,MIN_LEAD_MS=45*60*1000,MAX_LEAD_MS=18*60*60*1000;
const MAX_TEAM_FETCHES_PER_CYCLE=2,MAX_SIGNALS_STORED=1000,MAX_RUNS_PER_DAY=96;
function ms(v){if(typeof v==='number')return v<1e11?v*1000:v;const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null}
const jcopy=x=>JSON.parse(JSON.stringify(x));
const tidy=e=>String(e?.message||e).slice(0,150);
function isFT(f){const x=String(f?.boardState??f?.status??f?.status_code??f?.statusCode??'').toLowerCase();return /^(finished|ft|full|full_time|ended|complete|completed)$/.test(x)}
function scheduled(f){const x=String(f?.boardState??f?.status??f?.status_code??'').toLowerCase();return /^(scheduled|not_started|not started|ns)$/.test(x)}
function normalizeSnapshotFixture(f){
 return{fixtureId:String(f?.fixtureId??f?.id??''),home:f?.home??f?.teams?.home??null,away:f?.away??f?.teams?.away??null,
 kickoffUtc:f?.kickoffUtc??f?.kickoff_utc??(f?.kickoffAt?new Date(f.kickoffAt).toISOString():null),
 league:f?.league??null,goals:f?.goals??null,status:f?.status??f?.boardState,status_code:f?.statusCode??f?.status_code};
}
const isoDay=t=>new Date(t+7*3600000).toISOString().slice(0,10);
export function extendEngineWithForm5(Base,{enabled=false}={}){
 return class Nomad343EngineForm5 extends Base{
  async form5Health(){
   const m=await this.ctx.storage.get(K+'meta')||{},rows=await this.ctx.storage.get(K+'rows')||[];
   const by=Object.fromEntries(['PENDING','SETTLED','UNRESOLVED'].map(k=>[k,rows.filter(x=>x.status===k).length]));
   return{ok:true,component:'BALL46_FORM5',model:FORM5_RULE,enabled,operationalMode:enabled?'LIVE_BOUNDED':'DISABLED_DRY_SAFE',
    leadWindowMinutes:[45,1080],intervalMinutes:15,maxTeamApiCallsPerCycle:2,
    noVerifiedOdds:true,rows:rows.length,statuses:by,settled:rows.filter(r=>r.status==='SETTLED').length,
    lastRun:m.lastRun??null,lastSelection:m.lastSelection??null,lastError:m.lastError??null,lastProvider429:m.lastProvider429??null,
    backoffUntil:m.backoffUntil??null,totalProviderCalls:m.totalProviderCalls??0,providerCallsToday:m.providerCallsToday??0,
    providerDay:m.providerDay??null,apiDoesNotReturnROI:true};
  }
  async form5GetHub(){
   const res=await this.env.HUB.fetch('https://hub.internal/snapshot');
   if(res.status!==200)throw Error('HUB_'+res.status);
   const snap=await res.json();
   if(snap.ok!==true||snap.stale===true||Number(snap.ageMs??0)>180000)throw Error('HUB_SNAPSHOT_STALE');
   return snap;
  }
  async form5Request(url,m) {
   if(!this.env.FIVEDOLLAR_API_KEY)throw Error('PROVIDER_KEY_UNAVAILABLE');
   // Full Market and Hub requests share a 40/minute account cap; keep
   // this experiment to <=2 calls per 15-minute cycle, and stop on 429.
   if(m.callsThisCycle>=MAX_TEAM_FETCHES_PER_CYCLE)throw Error('FORM5_CALL_BUDGET');
   m.callsThisCycle++;
   m.totalProviderCalls=(m.totalProviderCalls||0)+1;
   m.providerCallsToday=(m.providerCallsToday||0)+1;
   const resp=await fetch(url,{headers:{authorization:'Bearer '+this.env.FIVEDOLLAR_API_KEY,accept:'application/json'},
     cache:'no-store',signal:AbortSignal.timeout(12500)});
   if(resp.status===429){m.lastProvider429=Date.now();m.backoffUntil=Date.now()+Math.max(15*60*1000,Number(resp.headers.get('retry-after')||0)*1000);throw Error('PROVIDER_429_BACKOFF');}
   if(!resp.ok)throw Error('PROVIDER_HTTP_'+resp.status);
   const data=await resp.json();
   if(data?.success!==1||!Array.isArray(data.data))throw Error('PROVIDER_FIXTURES_INVALID');
   return data.data;
  }
  async form5History(teamId,m){
   const key=K+'history:'+teamId,cache=await this.ctx.storage.get(key);
   if(cache&&Array.isArray(cache.rows)&&Date.now()-cache.at<HISTORY_TTL_MS)return cache.rows;
   if(m.callsThisCycle>=MAX_TEAM_FETCHES_PER_CYCLE)return null;
   const u=new URL('https://api.5dollarfootballapi.com/v1/teams/'+encodeURIComponent(teamId)+'/fixtures');
   u.searchParams.set('status','finished');u.searchParams.set('per_page','25');u.searchParams.set('order','desc');
   const rows=await this.form5Request(u,m);
   await this.ctx.storage.put(key,{at:Date.now(),rows});
   return rows;
  }
  async form5Cycle(){
   if(!enabled)return{ok:true,enabled:false,skipped:'DISABLED'};
   if(this._form5Promise)return this._form5Promise;
   this._form5Promise=this._form5Run().finally(()=>{this._form5Promise=null});
   return this._form5Promise;
  }
  async _form5Run(){
   const at=Date.now(),m=await this.ctx.storage.get(K+'meta')||{};
   if(m.lastRun&&at-m.lastRun<CYCLE_MS)return{ok:true,skipped:'INTERVAL',nextAt:m.lastRun+CYCLE_MS};
   if(m.backoffUntil&&at<m.backoffUntil)return{ok:true,skipped:'PROVIDER_BACKOFF',backoffUntil:m.backoffUntil};
   const day=isoDay(at);
   if(m.providerDay!==day){m.providerDay=day;m.providerCallsToday=0;}
   if((m.providerCallsToday||0)>=24)return{ok:true,skipped:'DAILY_PROVIDER_BUDGET'};
   m.callsThisCycle=0;m.lastRun=at;
   const rows=await this.ctx.storage.get(K+'rows')||[];
   let settled=0,created=0,inspected=0,errors=[];
   try{
    const hub=await this.form5GetHub();
    const byId=new Map((hub.fixtures||[]).filter(x=>x?.fixtureId!=null).map(x=>[String(x.fixtureId),x]));
    // Immutable pick FT settlement first. Never settle live or unknown.
    for(const existing of rows){
     if(existing.status!=='PENDING')continue;
     const f=byId.get(String(existing.fixtureId));if(!f||!isFT(f))continue;
     const done=settleBTTSForm5(existing,normalizeSnapshotFixture(f),at);
     if(!done.ok)continue;
     Object.assign(existing,{status:'SETTLED',result:done.result,finalScore:done.finalScore,settledAt:at});
     await this.upsertLedgerRows([form5LedgerRow(existing,normalizeSnapshotFixture(f),existing)]);
     settled++;
    }
    const upcoming=(hub.fixtures||[]).filter(f=>scheduled(f)&&f?.home?.id&&f?.away?.id&&
      ms(f.kickoffUtc??f.kickoffAt)>at+MIN_LEAD_MS&&ms(f.kickoffUtc??f.kickoffAt)<at+MAX_LEAD_MS);
    upcoming.sort((a,b)=>ms(a.kickoffUtc??a.kickoffAt)-ms(b.kickoffUtc??b.kickoffAt));
    const checked=await this.ctx.storage.get(K+'checked')||{};
    for(const raw of upcoming){
      if(m.callsThisCycle>=MAX_TEAM_FETCHES_PER_CYCLE||inspected>=4)break;
      const f=normalizeSnapshotFixture(raw);
      if(checked[f.fixtureId]||rows.some(x=>x.fixtureId===f.fixtureId))continue;
      inspected++;
      let h,a;
      try{
       h=await this.form5History(String(f.home.id),m);
       a=await this.form5History(String(f.away.id),m);
      }catch(err){errors.push({fixtureId:f.fixtureId,error:tidy(err)});if(/429/.test(tidy(err)))break;continue;}
      if(!h||!a)continue;
      const result=evaluateBTTSForm5(f,h,a,at);
      if(result.reason.endsWith('INSUFFICIENT_FINISHED_HISTORY'))continue; // re-evaluate if provider history updates
      checked[f.fixtureId]={at,selection:result.selection,reason:result.reason};
      if(result.status!=='PENDING')continue;
      const led=form5LedgerRow(result,f);
      // DO single actor and stable row ID, never re-create at a later price.
      await this.upsertLedgerRows([led]);
      rows.push({...result,createdAt:Date.parse(result.issuedAt),home:f.home,away:f.away,league:f.league});
      created++;m.lastSelection={id:result.id,fixtureId:f.fixtureId,market:result.market,at};
    }
    for(const [id,s]of Object.entries(checked))if(Number(s.at)<at-4*86400000)delete checked[id];
    await this.ctx.storage.put(K+'checked',checked);
    const trim=rows.filter(x=>x.status!=='SETTLED'||at-Number(x.settledAt||at)<45*86400000).slice(-MAX_SIGNALS_STORED);
    await this.ctx.storage.put(K+'rows',trim);
    m.lastError=errors[0]?.error||null;
   }catch(err){m.lastError=tidy(err);errors.push({error:m.lastError});}
   delete m.callsThisCycle;
   await this.ctx.storage.put(K+'meta',m);
   return{ok:errors.length===0,version:FORM5_RULE,created,settled,inspected,
     totalProviderCalls:m.totalProviderCalls||0,providerCallsToday:m.providerCallsToday||0,errors};
  }
  async fetch(request){
    const u=new URL(request.url);
    if(u.pathname==='/form5-health'&&request.method==='GET')return Response.json(await this.form5Health());
    if(u.pathname==='/form5-cycle'&&request.method==='POST')return Response.json(await this.form5Cycle());
    return super.fetch(request);
  }
 }
}
