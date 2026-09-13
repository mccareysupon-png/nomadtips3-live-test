import {
  FIVEUSD_CADENCE,fetchLiveFixtures,fetchRefereeSnapshot,fetchScheduledFixtures,filterBoardFixtures,
} from './fivedollar.js';

const LIVE_KEY='fiveUsdNativeLiveV1';
const UPCOMING_KEY='fiveUsdNativeUpcomingV1';
const BOARD_KEY='fiveUsdNativeBoardV1';
const STATE_KEY='fiveUsdNativeStateV1';
const CORE_RATE_KEY='fiveUsdNativeCoreRateV1';
const REFEREE_RATE_KEY='fiveUsdNativeRefereeRateV1';
const REFEREE_PREFIX='fiveUsdNativeReferee:';
const RATE_WINDOW_MS=60_000;
const MIN_RETRY_MS=250;
const DEFAULT_UPCOMING_WINDOW_MS=2*60*60*1000;
const UPCOMING_MAX_PAGES=3;

const now=()=>Date.now();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const modeOf=env=>String(env?.FIVEUSD_NATIVE_MODE||'off').trim().toLowerCase();

export class FiveUsdRateGuardError extends Error{
  constructor(bucket,retryAfterMs){
    super(`FIVEUSD_${String(bucket).toUpperCase()}_RATE_GUARD`);
    this.name='FiveUsdRateGuardError';
    this.code=this.message;
    this.retryAfterMs=retryAfterMs;
  }
}

export class FiveUsdNativeRuntime{
  constructor(storage,env,{fetchImpl=fetch,clock=now}={}){
    this.storage=storage;
    this.env=env||{};
    this.fetchImpl=fetchImpl;
    this.clock=clock;
    this.tickPromise=null;
    this.livePromise=null;
    this.upcomingPromise=null;
    this.refereePromises=new Map();
  }

  mode(){return modeOf(this.env);}
  enabled(){return ['shadow','authority'].includes(this.mode());}
  shadowOnly(){return this.mode()!=='authority';}
  apiKey(){return this.env.FIVEDOLLAR_API_KEY||null;}
  upcomingWindowMs(){
    const configured=Number(this.env.FIVEUSD_UPCOMING_WINDOW_MINUTES);
    return Number.isFinite(configured)&&configured>0?Math.round(configured*60_000):DEFAULT_UPCOMING_WINDOW_MS;
  }

  async _rows(key,tx=this.storage){
    const at=this.clock();
    return ((await tx.get(key))||[]).filter(row=>at-Number(row?.at||0)<RATE_WINDOW_MS&&Number(row?.count||0)>0);
  }

  async _reserve(key,ceiling,count,kind){
    const wanted=Math.max(1,Math.round(Number(count)||1));
    const at=this.clock();
    let result=null;
    await this.storage.transaction(async tx=>{
      const rows=await this._rows(key,tx);
      const used=rows.reduce((sum,row)=>sum+Number(row.count||0),0);
      if(used+wanted>ceiling){
        const oldestAt=Number(rows[0]?.at||at);
        result={ok:false,used,wanted,retryAfterMs:Math.max(MIN_RETRY_MS,RATE_WINDOW_MS-(at-oldestAt))};
        await tx.put(key,rows);
        return;
      }
      const token=`${at.toString(36)}-${crypto.randomUUID()}`;
      rows.push({token,at,count:wanted,kind});
      await tx.put(key,rows);
      result={ok:true,token,used:used+wanted,wanted,retryAfterMs:0};
    });
    return result;
  }

  async _finalize(key,token,actualCount){
    if(!token) return;
    const actual=Math.max(0,Math.round(Number(actualCount)||0));
    await this.storage.transaction(async tx=>{
      const rows=await this._rows(key,tx),next=[];
      for(const row of rows){
        if(row.token!==token){next.push(row);continue;}
        if(actual>0) next.push({...row,count:actual});
      }
      await tx.put(key,next);
    });
  }

  async _rateStats(key,ceiling){
    const rows=await this._rows(key);
    return {
      usedLast60s:rows.reduce((sum,row)=>sum+Number(row.count||0),0),
      internalCeiling:ceiling,
      providerCeiling:FIVEUSD_CADENCE.providerRequestCeilingPer60s,
    };
  }

  async coreRate(){return this._rateStats(CORE_RATE_KEY,FIVEUSD_CADENCE.liveRequestBudgetPer60s);}
  async refereeRate(){return this._rateStats(REFEREE_RATE_KEY,FIVEUSD_CADENCE.refereeRequestBudgetPer60s);}

  async refreshLive({force=false}={}){
    if(!this.enabled()) return null;
    const previous=await this.storage.get(LIVE_KEY)||null,at=this.clock();
    if(!force&&finite(previous?.fetchedAt)&&at-Number(previous.fetchedAt)<FIVEUSD_CADENCE.liveRefreshMs) return previous;
    if(this.livePromise) return this.livePromise;
    this.livePromise=(async()=>{
      const reservation=await this._reserve(CORE_RATE_KEY,FIVEUSD_CADENCE.liveRequestBudgetPer60s,1,'live');
      if(!reservation.ok) throw new FiveUsdRateGuardError('core',reservation.retryAfterMs);
      let actual=0;
      try{
        const result=await fetchLiveFixtures({apiKey:this.apiKey(),fetchImpl:this.fetchImpl,maxPages:1,observedAt:at});
        actual=result.requests;
        const snapshot={
          fetchedAt:at,fixtures:result.fixtures,requests:result.requests,rate:result.rate,truncated:Boolean(result.truncated),
          pageSize:FIVEUSD_CADENCE.livePageSize,refreshMs:FIVEUSD_CADENCE.liveRefreshMs,
        };
        await this.storage.put(LIVE_KEY,snapshot);
        return snapshot;
      }finally{
        await this._finalize(CORE_RATE_KEY,reservation.token,actual||1);
      }
    })().finally(()=>{this.livePromise=null;});
    return this.livePromise;
  }

  async refreshUpcoming({force=false}={}){
    if(!this.enabled()) return null;
    const previous=await this.storage.get(UPCOMING_KEY)||null,at=this.clock();
    if(!force&&finite(previous?.fetchedAt)&&at-Number(previous.fetchedAt)<FIVEUSD_CADENCE.upcomingRefreshMs) return previous;
    if(this.upcomingPromise) return this.upcomingPromise;
    this.upcomingPromise=(async()=>{
      const reservation=await this._reserve(CORE_RATE_KEY,FIVEUSD_CADENCE.liveRequestBudgetPer60s,UPCOMING_MAX_PAGES,'scheduled');
      if(!reservation.ok) throw new FiveUsdRateGuardError('core',reservation.retryAfterMs);
      let actual=0;
      try{
        const endAt=at+this.upcomingWindowMs();
        const result=await fetchScheduledFixtures({
          apiKey:this.apiKey(),fetchImpl:this.fetchImpl,startTime:at,endTime:endAt,maxPages:UPCOMING_MAX_PAGES,observedAt:at,
        });
        actual=result.requests;
        const snapshot={
          fetchedAt:at,fixtures:result.fixtures,requests:result.requests,rate:result.rate,truncated:Boolean(result.truncated),
          refreshMs:FIVEUSD_CADENCE.upcomingRefreshMs,windowStart:at,windowEnd:endAt,
        };
        await this.storage.put(UPCOMING_KEY,snapshot);
        return snapshot;
      }finally{
        await this._finalize(CORE_RATE_KEY,reservation.token,actual||1);
      }
    })().finally(()=>{this.upcomingPromise=null;});
    return this.upcomingPromise;
  }

  async rebuildBoard(at=this.clock()){
    const live=await this.storage.get(LIVE_KEY)||null,upcoming=await this.storage.get(UPCOMING_KEY)||null;
    const byId=new Map();
    for(const row of live?.fixtures||[]) if(row?.fixtureId) byId.set(String(row.fixtureId),row);
    for(const row of upcoming?.fixtures||[]) if(row?.fixtureId&&!byId.has(String(row.fixtureId))) byId.set(String(row.fixtureId),row);
    const fixtures=filterBoardFixtures([...byId.values()],{at,upcomingWindowMs:this.upcomingWindowMs()});
    const board={
      updatedAt:at,
      fixtures,
      counts:{live:fixtures.filter(row=>row.boardState==='live').length,waiting:fixtures.filter(row=>row.boardState==='scheduled').length},
      terminalDisplayed:fixtures.filter(row=>row.boardState==='terminal').length,
    };
    await this.storage.put(BOARD_KEY,board);
    return board;
  }

  async tick({force=false}={}){
    if(!this.enabled()) return {ok:false,mode:this.mode(),error:'FIVEUSD_NATIVE_DISABLED'};
    if(this.tickPromise) return this.tickPromise;
    this.tickPromise=(async()=>{
      const startedAt=this.clock();
      let live=null,upcoming=null,lastError=null;
      try{live=await this.refreshLive({force});}catch(error){lastError=String(error?.message||error);}
      try{upcoming=await this.refreshUpcoming({force:false});}catch(error){lastError=lastError||String(error?.message||error);}
      const board=await this.rebuildBoard(this.clock());
      const finishedAt=this.clock();
      const state={
        ok:!lastError,mode:this.mode(),shadowOnly:this.shadowOnly(),startedAt,finishedAt,lastError,
        live:{fetchedAt:live?.fetchedAt??null,count:live?.fixtures?.length??0,truncated:Boolean(live?.truncated)},
        upcoming:{fetchedAt:upcoming?.fetchedAt??null,count:upcoming?.fixtures?.length??0,truncated:Boolean(upcoming?.truncated)},
        board:{updatedAt:board.updatedAt,counts:board.counts,terminalDisplayed:board.terminalDisplayed},
      };
      await this.storage.put(STATE_KEY,state);
      return state;
    })().finally(()=>{this.tickPromise=null;});
    return this.tickPromise;
  }

  async refreshReferee(fixtureId,{force=false}={}){
    if(!this.enabled()) return {ok:false,error:'FIVEUSD_NATIVE_DISABLED'};
    const id=String(fixtureId??'').trim();
    if(!id) return {ok:false,error:'FIVEUSD_FIXTURE_ID_MISSING'};
    const key=`${REFEREE_PREFIX}${id}`,previous=await this.storage.get(key)||null;
    if(!force&&finite(previous?.observedAt)&&this.clock()-Number(previous.observedAt)<60_000) return previous;
    if(this.refereePromises.has(id)) return this.refereePromises.get(id);
    const promise=(async()=>{
      const reservation=await this._reserve(REFEREE_RATE_KEY,FIVEUSD_CADENCE.refereeRequestBudgetPer60s,1,'candidate-referee');
      if(!reservation.ok) throw new FiveUsdRateGuardError('referee',reservation.retryAfterMs);
      let actual=0;
      try{
        const snapshot=await fetchRefereeSnapshot({fixtureId:id,apiKey:this.apiKey(),fetchImpl:this.fetchImpl,previous,observedAt:this.clock()});
        actual=snapshot.requests;
        const safe={...snapshot,mode:'SHADOW_ONLY',shadowOnly:true,votingEnabled:false};
        await this.storage.put(key,safe);
        return safe;
      }finally{
        await this._finalize(REFEREE_RATE_KEY,reservation.token,actual||1);
      }
    })().finally(()=>this.refereePromises.delete(id));
    this.refereePromises.set(id,promise);
    return promise;
  }

  async snapshot(){return {board:await this.storage.get(BOARD_KEY)||null,state:await this.storage.get(STATE_KEY)||null,live:await this.storage.get(LIVE_KEY)||null,upcoming:await this.storage.get(UPCOMING_KEY)||null};}

  async health(){
    const snapshot=await this.snapshot();
    return {
      enabled:this.enabled(),mode:this.mode(),shadowOnly:this.shadowOnly(),hasKey:Boolean(this.apiKey()),
      cadence:{cycleMs:FIVEUSD_CADENCE.liveRefreshMs,noOverlap:true,upcomingRefreshMs:FIVEUSD_CADENCE.upcomingRefreshMs},
      rate:{core:await this.coreRate(),referee:await this.refereeRate()},
      state:snapshot.state,
      board:snapshot.board?{updatedAt:snapshot.board.updatedAt,counts:snapshot.board.counts,terminalDisplayed:snapshot.board.terminalDisplayed}:null,
      live:snapshot.live?{fetchedAt:snapshot.live.fetchedAt,count:snapshot.live.fixtures?.length??0,truncated:Boolean(snapshot.live.truncated)}:null,
      upcoming:snapshot.upcoming?{fetchedAt:snapshot.upcoming.fetchedAt,count:snapshot.upcoming.fixtures?.length??0,truncated:Boolean(snapshot.upcoming.truncated)}:null,
    };
  }
}
