import {
  FIVEUSD_CADENCE,fetchLiveFixtures,fetchRefereeSnapshot,fetchScheduledFixtures,filterBoardFixtures,
} from './fivedollar.js';

const LIVE_KEY='fiveUsdNativeLiveV1';
const UPCOMING_KEY='fiveUsdNativeUpcomingV1';
const BOARD_KEY='fiveUsdNativeBoardV1';
const STATE_KEY='fiveUsdNativeStateV1';
const REQUEST_RATE_KEY='fiveUsdNativeRequestRateV2';
const REFEREE_PREFIX='fiveUsdNativeReferee:';
const RATE_WINDOW_MS=60_000;
const MIN_RETRY_MS=250;
const DEFAULT_UPCOMING_WINDOW_MS=2*60*60*1000;

const now=()=>Date.now();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const modeOf=env=>String(env?.FIVEUSD_NATIVE_MODE||'off').trim().toLowerCase();
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const isProviderThrottle=error=>error instanceof FiveUsdRateGuardError||Number(error?.status)===429||String(error?.message||error).includes('5USD_HTTP_429');

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

  _intSetting(name,fallback,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
    const raw=this.env?.[name];
    const parsed=Number(raw);
    if(raw===undefined||raw===null||raw===''||!Number.isFinite(parsed)) return fallback;
    return Math.round(clamp(parsed,min,max));
  }

  liveRefreshMs(){return this._intSetting('FIVEUSD_LIVE_REFRESH_MS',FIVEUSD_CADENCE.liveRefreshMs,{min:1000,max:60_000});}
  upcomingRefreshMs(){return this._intSetting('FIVEUSD_UPCOMING_REFRESH_MS',FIVEUSD_CADENCE.upcomingRefreshMs,{min:10_000,max:3_600_000});}
  refereeRefreshMs(){return this._intSetting('FIVEUSD_REFEREE_REFRESH_MS',60_000,{min:1000,max:3_600_000});}
  liveMaxPages(){return this._intSetting('FIVEUSD_LIVE_MAX_PAGES',FIVEUSD_CADENCE.liveMaxPages,{min:1,max:FIVEUSD_CADENCE.liveMaxPages});}
  upcomingMaxPages(){return this._intSetting('FIVEUSD_UPCOMING_MAX_PAGES',10,{min:1,max:10});}
  providerCeiling(){return FIVEUSD_CADENCE.providerRequestCeilingPer60s;}
  globalBudget(){return this._intSetting('FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S',this.providerCeiling(),{min:1,max:this.providerCeiling()});}

  upcomingWindowMs(){
    const configured=Number(this.env.FIVEUSD_UPCOMING_WINDOW_MINUTES);
    return Number.isFinite(configured)&&configured>0?Math.round(configured*60_000):DEFAULT_UPCOMING_WINDOW_MS;
  }

  async _rows(tx=this.storage){
    const at=this.clock();
    return ((await tx.get(REQUEST_RATE_KEY))||[]).filter(row=>at-Number(row?.at||0)<RATE_WINDOW_MS&&Number(row?.count||0)>0);
  }

  _usage(rows,kind){
    const totalUsed=rows.reduce((sum,row)=>sum+Number(row.count||0),0);
    const laneUsed=rows.filter(row=>row.kind===kind).reduce((sum,row)=>sum+Number(row.count||0),0);
    return {totalUsed,laneUsed,globalCeiling:this.globalBudget()};
  }

  async _capacity(kind){
    const rows=await this._rows();
    const at=this.clock();
    const {totalUsed,globalCeiling}=this._usage(rows,kind);
    const available=Math.max(0,globalCeiling-totalUsed);
    const oldestAt=Number(rows[0]?.at||at);
    return {
      available,
      bucket:available<=0?'global':null,
      retryAfterMs:Math.max(MIN_RETRY_MS,RATE_WINDOW_MS-(at-oldestAt)),
    };
  }

  async _reserve(kind,count){
    const wanted=Math.max(1,Math.round(Number(count)||1));
    const at=this.clock();
    let result=null;
    await this.storage.transaction(async tx=>{
      const rows=await this._rows(tx);
      const {totalUsed,laneUsed,globalCeiling}=this._usage(rows,kind);
      const oldestAt=Number(rows[0]?.at||at);
      const retryAfterMs=Math.max(MIN_RETRY_MS,RATE_WINDOW_MS-(at-oldestAt));

      if(totalUsed+wanted>globalCeiling){
        result={ok:false,bucket:'global',used:totalUsed,wanted,retryAfterMs};
        await tx.put(REQUEST_RATE_KEY,rows);
        return;
      }

      const token=`${at.toString(36)}-${crypto.randomUUID()}`;
      rows.push({token,at,count:wanted,kind});
      await tx.put(REQUEST_RATE_KEY,rows);
      result={ok:true,token,totalUsed:totalUsed+wanted,laneUsed:laneUsed+wanted,wanted,retryAfterMs:0};
    });
    return result;
  }

  async _finalize(token,actualCount){
    if(!token) return;
    const actual=Math.max(0,Math.round(Number(actualCount)||0));
    await this.storage.transaction(async tx=>{
      const rows=await this._rows(tx),next=[];
      for(const row of rows){
        if(row.token!==token){next.push(row);continue;}
        if(actual>0) next.push({...row,count:actual});
      }
      await tx.put(REQUEST_RATE_KEY,next);
    });
  }

  async _rateStats(kind=null){
    const rows=await this._rows();
    const globalUsed=rows.reduce((sum,row)=>sum+Number(row.count||0),0);
    const used=kind?rows.filter(row=>row.kind===kind).reduce((sum,row)=>sum+Number(row.count||0),0):globalUsed;
    return {
      usedLast60s:used,
      configuredCeiling:kind?null:this.globalBudget(),
      effectiveCeiling:this.globalBudget(),
      globalUsedLast60s:globalUsed,
      globalCeiling:this.globalBudget(),
      providerCeiling:this.providerCeiling(),
      unlocked:Boolean(kind),
      guardScope:kind?'GLOBAL_ONLY':'PROVIDER_GLOBAL',
    };
  }

  async globalRate(){return this._rateStats();}
  async coreRate(){return this.globalRate();}
  async liveRate(){return this._rateStats('live');}
  async upcomingRate(){return this._rateStats('scheduled');}
  async refereeRate(){return this._rateStats('referee');}

  async _pageReservation(kind,configuredMaxPages){
    const capacity=await this._capacity(kind);
    if(capacity.available<1) throw new FiveUsdRateGuardError('global',capacity.retryAfterMs);
    // Reserve only the first actual request. Pagination is allowed to run freely;
    // _finalize records the real request count after the provider call completes.
    const reservation=await this._reserve(kind,1);
    if(!reservation.ok) throw new FiveUsdRateGuardError('global',reservation.retryAfterMs);
    return {...reservation,allowedPages:configuredMaxPages};
  }

  async refreshLive({force=false}={}){
    if(!this.enabled()) return null;
    const previous=await this.storage.get(LIVE_KEY)||null,at=this.clock();
    if(!force&&finite(previous?.fetchedAt)&&at-Number(previous.fetchedAt)<this.liveRefreshMs()) return previous;
    if(this.livePromise) return this.livePromise;
    this.livePromise=(async()=>{
      const configuredMaxPages=this.liveMaxPages();
      const reservation=await this._pageReservation('live',configuredMaxPages);
      let actual=0;
      try{
        const result=await fetchLiveFixtures({apiKey:this.apiKey(),fetchImpl:this.fetchImpl,maxPages:reservation.allowedPages,observedAt:at});
        actual=result.requests;
        const snapshot={
          fetchedAt:at,fixtures:result.fixtures,requests:result.requests,rate:result.rate,truncated:Boolean(result.truncated),
          pageSize:FIVEUSD_CADENCE.livePageSize,refreshMs:this.liveRefreshMs(),maxPages:reservation.allowedPages,configuredMaxPages,
        };
        await this.storage.put(LIVE_KEY,snapshot);
        return snapshot;
      }finally{
        await this._finalize(reservation.token,actual||1);
      }
    })().finally(()=>{this.livePromise=null;});
    return this.livePromise;
  }

  async refreshUpcoming({force=false}={}){
    if(!this.enabled()) return null;
    const previous=await this.storage.get(UPCOMING_KEY)||null,at=this.clock();
    if(!force&&finite(previous?.fetchedAt)&&at-Number(previous.fetchedAt)<this.upcomingRefreshMs()) return previous;
    if(this.upcomingPromise) return this.upcomingPromise;
    this.upcomingPromise=(async()=>{
      const configuredMaxPages=this.upcomingMaxPages();
      const reservation=await this._pageReservation('scheduled',configuredMaxPages);
      let actual=0;
      try{
        const endAt=at+this.upcomingWindowMs();
        const result=await fetchScheduledFixtures({
          apiKey:this.apiKey(),fetchImpl:this.fetchImpl,startTime:at,endTime:endAt,maxPages:reservation.allowedPages,observedAt:at,
        });
        actual=result.requests;
        const snapshot={
          fetchedAt:at,fixtures:result.fixtures,requests:result.requests,rate:result.rate,truncated:Boolean(result.truncated),
          refreshMs:this.upcomingRefreshMs(),windowStart:at,windowEnd:endAt,maxPages:reservation.allowedPages,configuredMaxPages,
        };
        await this.storage.put(UPCOMING_KEY,snapshot);
        return snapshot;
      }finally{
        await this._finalize(reservation.token,actual||1);
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
      const throttled=[];
      try{live=await this.refreshLive({force});}
      catch(error){
        if(isProviderThrottle(error)) throttled.push({path:'live',code:String(error?.code||error?.message||'5USD_THROTTLED'),retryAfterMs:error?.retryAfterMs??null});
        else lastError=String(error?.message||error);
      }
      try{upcoming=await this.refreshUpcoming({force:false});}
      catch(error){
        if(isProviderThrottle(error)) throttled.push({path:'waiting',code:String(error?.code||error?.message||'5USD_THROTTLED'),retryAfterMs:error?.retryAfterMs??null});
        else lastError=lastError||String(error?.message||error);
      }
      if(!live) live=await this.storage.get(LIVE_KEY)||null;
      if(!upcoming) upcoming=await this.storage.get(UPCOMING_KEY)||null;
      const board=await this.rebuildBoard(this.clock());
      const finishedAt=this.clock();
      const state={
        ok:!lastError,mode:this.mode(),shadowOnly:this.shadowOnly(),startedAt,finishedAt,lastError,
        rateLimited:throttled.length>0,throttled,
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
    if(!force&&finite(previous?.observedAt)&&this.clock()-Number(previous.observedAt)<this.refereeRefreshMs()) return previous;
    if(this.refereePromises.has(id)) return this.refereePromises.get(id);
    const promise=(async()=>{
      const capacity=await this._capacity('referee');
      if(capacity.available<1) throw new FiveUsdRateGuardError('global',capacity.retryAfterMs);
      const reservation=await this._reserve('referee',1);
      if(!reservation.ok) throw new FiveUsdRateGuardError('global',reservation.retryAfterMs);
      let actual=0;
      try{
        const snapshot=await fetchRefereeSnapshot({fixtureId:id,apiKey:this.apiKey(),fetchImpl:this.fetchImpl,previous,observedAt:this.clock()});
        actual=snapshot.requests;
        const safe={...snapshot,mode:'SHADOW_ONLY',shadowOnly:true,votingEnabled:false};
        await this.storage.put(key,safe);
        return safe;
      }finally{
        await this._finalize(reservation.token,actual||1);
      }
    })().finally(()=>this.refereePromises.delete(id));
    this.refereePromises.set(id,promise);
    return promise;
  }

  async snapshot(){return {board:await this.storage.get(BOARD_KEY)||null,state:await this.storage.get(STATE_KEY)||null,live:await this.storage.get(LIVE_KEY)||null,upcoming:await this.storage.get(UPCOMING_KEY)||null};}

  async health(){
    const snapshot=await this.snapshot();
    const global=await this.globalRate(),live=await this.liveRate(),upcoming=await this.upcomingRate(),referee=await this.refereeRate();
    return {
      enabled:this.enabled(),mode:this.mode(),shadowOnly:this.shadowOnly(),hasKey:Boolean(this.apiKey()),
      cadence:{cycleMs:this.liveRefreshMs(),noOverlap:true,upcomingRefreshMs:this.upcomingRefreshMs(),refereeRefreshMs:this.refereeRefreshMs()},
      rate:{global,core:global,live,upcoming,referee},
      state:snapshot.state,
      board:snapshot.board?{updatedAt:snapshot.board.updatedAt,counts:snapshot.board.counts,terminalDisplayed:snapshot.board.terminalDisplayed}:null,
      live:snapshot.live?{fetchedAt:snapshot.live.fetchedAt,count:snapshot.live.fixtures?.length??0,truncated:Boolean(snapshot.live.truncated)}:null,
      upcoming:snapshot.upcoming?{fetchedAt:snapshot.upcoming.fetchedAt,count:snapshot.upcoming.fixtures?.length??0,truncated:Boolean(snapshot.upcoming.truncated)}:null,
    };
  }
}