const DEFAULTS={
  minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,
  scoreDifferenceFilterEnabled:false,maxScoreDifference:2,
  attackWeight:1,dangerousAttackWeight:1,
  homePressureShareMinimum:55,trendConditionsRequired:1,
  homeEventRequired:true,sotEvidenceEnabled:true,sotDeltaMinimum:1,
  shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,
  cornerEvidenceEnabled:true,cornerDeltaMinimum:1,evidenceMode:'ANY',
  targetSideMode:'HOME',oddsMinimum:1.5,oddsMaximum:6,
  maximumPriceAgeSeconds:90,oneSignalPerMatch:true,
  maxHistoryPerFixture:60
};

const num=v=>Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const pair=v=>({home:num(v?.home)??0,away:num(v?.away)??0});
const safeIso=v=>{const ms=Date.parse(v||'');return Number.isFinite(ms)?new Date(ms).toISOString():null;};

function fixtureMinute(f){
  const direct=num(f?.minute);
  if(direct!=null)return direct;
  const code=String(f?.status_code??'').trim();
  const match=code.match(/\d+/);
  return match?num(match[0]):null;
}

function normalizeBookmakerOdds(odds,nowIso){
  const out=[];
  const push=(bookmaker,market,stage={})=>{
    if(!stage||typeof stage!=='object')return;
    const line=num(stage.line??stage.handicap??stage.value);
    const stamp=stage.updated_at||stage.updatedAt||stage.timestamp||odds?.updated_at||null;
    const add=(side,price)=>{
      const p=num(price);
      if(line==null&&p==null)return;
      out.push({source:'5USD',bookmaker:bookmaker||'Bet365',market:'asian_handicap',side,line,odds:p,sourceUpdatedAt:safeIso(stamp)||nowIso});
    };
    add('home',stage.home??stage.home_price??stage.price_home);
    add('away',stage.away??stage.away_price??stage.price_away);
  };
  const books=Array.isArray(odds?.bookmakers)?odds.bookmakers:Array.isArray(odds?.books)?odds.books:[];
  for(const b of books){
    const markets=b?.markets||b?.odds||{};
    const ah=markets.asian_handicap||markets.asianHandicap||markets.ah||{};
    push(b?.name||b?.bookmaker||'—','asian_handicap',ah.inplay||ah.live||ah.current||ah);
  }
  if(!books.length&&odds&&typeof odds==='object'){
    for(const [name,value] of Object.entries(odds)){
      if(!value||typeof value!=='object'||name==='bookmakers'||name==='pagination')continue;
      const ah=value.asian_handicap||value.asianHandicap||value.ah;
      if(ah)push(name,'asian_handicap',ah.inplay||ah.live||ah.current||ah);
    }
    const ah=odds.asian_handicap||odds.asianHandicap||odds.ah;
    if(ah)push('Bet365','asian_handicap',ah.inplay||ah.live||ah.current||ah);
  }
  return out;
}

export function normalizeFixture(f={},observedAt=new Date().toISOString()){
  const stats=f.statistics;
  const statsAvailable=Boolean(stats&&typeof stats==='object');
  const prices=normalizeBookmakerOdds(f.odds,observedAt);
  return {
    id:String(f.id??''),
    league:f.league?.name||f.league_name||'—',
    leagueId:f.league?.id??null,
    home:f.teams?.home?.name||f.home?.name||f.home_name||'Home',
    away:f.teams?.away?.name||f.away?.name||f.away_name||'Away',
    status:String(f.status||'unknown'),
    minute:fixtureMinute(f),
    kickoffUtc:f.kickoff_utc||null,
    score:{home:num(f.goals?.home)??0,away:num(f.goals?.away)??0},
    corners:pair(f.corners),
    cards:{home:{yellow:num(f.cards?.home?.yellow)??0,red:num(f.cards?.home?.red)??0},away:{yellow:num(f.cards?.away?.yellow)??0,red:num(f.cards?.away?.red)??0}},
    statsAvailable,
    stats:{
      attacks:pair(stats?.attacks),
      dangerousAttack:pair(stats?.dangerous_attacks||stats?.dangerousAttack),
      shotsOn:pair(stats?.shots_on_target||stats?.shotsOn),
      shotsOff:pair(stats?.shots_off_target||stats?.shotsOff),
      corners:pair(f.corners),
      possession:pair(stats?.possession)
    },
    events:Array.isArray(f.events)?f.events:[],
    priceSources:prices,
    rawOdds:f.odds||null,
    providerUpdatedAt:observedAt
  };
}

function deltaPair(a,b){return {home:Math.max(0,(a?.home??0)-(b?.home??0)),away:Math.max(0,(a?.away??0)-(b?.away??0))};}
function statsDelta(a,b){return {attacks:deltaPair(a?.attacks,b?.attacks),dangerousAttack:deltaPair(a?.dangerousAttack,b?.dangerousAttack),shotsOn:deltaPair(a?.shotsOn,b?.shotsOn),shotsOff:deltaPair(a?.shotsOff,b?.shotsOff),corners:deltaPair(a?.corners,b?.corners)};}
function pressureScore(d,side,cfg){return (d.attacks?.[side]??0)*cfg.attackWeight+(d.dangerousAttack?.[side]??0)*cfg.dangerousAttackWeight+(d.shotsOn?.[side]??0)*4+(d.shotsOff?.[side]??0)*2+(d.corners?.[side]??0)*3;}
function pressureBlock(d,cfg){const home=pressureScore(d,'home',cfg),away=pressureScore(d,'away',cfg),sum=home+away;return {home,away,homeShare:sum?home/sum*100:50,awayShare:sum?away/sum*100:50,tempo:Math.round(clamp(sum*3,0,100))};}
function before(list,target){for(let i=list.length-1;i>=0;i--){if(list[i].at<=target)return list[i];}return null;}

function rollingFor(m,list,cfg,current){
  if(!m.statsAvailable)return {available:false,reason:'NO_STATS',windowMinutes:cfg.rollingWindowMinutes};
  const win=cfg.rollingWindowMinutes*60000;
  const base1=before(list,current.at-win),base2=before(list,current.at-win*2);
  if(!base1||!base2)return {available:false,reason:'WARMING',windowMinutes:cfg.rollingWindowMinutes,recent:{homePressure:0,awayPressure:0,tempo:0,delta:{shotsOn:{home:0,away:0},shotsOff:{home:0,away:0},corners:{home:0,away:0}}},previous:{homePressure:0,awayPressure:0,tempo:0},sides:{home:{pressureShare:50},away:{pressureShare:50}}};
  const recentDelta=statsDelta(current.stats,base1.stats),previousDelta=statsDelta(base1.stats,base2.stats);
  const rp=pressureBlock(recentDelta,cfg),pp=pressureBlock(previousDelta,cfg);
  return {available:true,windowMinutes:cfg.rollingWindowMinutes,recent:{homePressure:+rp.home.toFixed(2),awayPressure:+rp.away.toFixed(2),tempo:rp.tempo,delta:{shotsOn:recentDelta.shotsOn,shotsOff:recentDelta.shotsOff,corners:recentDelta.corners},rawDelta:recentDelta},previous:{homePressure:+pp.home.toFixed(2),awayPressure:+pp.away.toFixed(2),tempo:pp.tempo,rawDelta:previousDelta},sides:{home:{pressureShare:+rp.homeShare.toFixed(1)},away:{pressureShare:+rp.awayShare.toFixed(1)}}};
}

function evidenceFor(rolling,side,cfg){
  const d=rolling?.recent?.delta||{},tests=[];
  if(cfg.sotEvidenceEnabled)tests.push((d.shotsOn?.[side]??0)>=cfg.sotDeltaMinimum);
  if(cfg.shotOffEvidenceEnabled)tests.push((d.shotsOff?.[side]??0)>=cfg.shotOffDeltaMinimum);
  if(cfg.cornerEvidenceEnabled)tests.push((d.corners?.[side]??0)>=cfg.cornerDeltaMinimum);
  const mode=String(cfg.evidenceMode).toUpperCase();
  const passed=!cfg.homeEventRequired?true:tests.length?(mode==='ALL'?tests.every(Boolean):tests.some(Boolean)):false;
  return {required:cfg.homeEventRequired,mode,enabledCount:tests.length,passed};
}

function hungerFor(rolling,side,cfg){
  if(!rolling?.available)return {passed:false,passedCount:0,total:3,required:cfg.trendConditionsRequired,conditions:[false,false,false]};
  const recent=rolling.recent||{},previous=rolling.previous||{},raw=recent.rawDelta||{};
  const share=rolling.sides?.[side]?.pressureShare??0,current=side==='away'?recent.awayPressure:recent.homePressure,prior=side==='away'?previous.awayPressure:previous.homePressure;
  const attacking=(raw.attacks?.[side]??0)+(raw.dangerousAttack?.[side]??0)+(raw.shotsOn?.[side]??0)*2;
  const conditions=[share>=cfg.homePressureShareMinimum,current>prior,attacking>0];
  const passedCount=conditions.filter(Boolean).length,required=clamp(Number(cfg.trendConditionsRequired)||1,1,3);
  return {passed:passedCount>=required,passedCount,total:3,required,conditions};
}

function priceAge(q,nowMs){
  if(num(q?.priceAgeSeconds)!=null)return Math.max(0,num(q.priceAgeSeconds));
  const ms=Date.parse(q?.sourceUpdatedAt||'');
  return Number.isFinite(ms)?Math.max(0,(nowMs-ms)/1000):null;
}

function inspectPrice(m,side,cfg,nowMs){
  const checked=(m.priceSources||[]).map(q=>{
    const reasons=[],age=priceAge(q,nowMs),odds=num(q.odds),line=num(q.line);
    if(q.side!==side)reasons.push('SIDE_MISMATCH');
    if(odds==null)reasons.push('NO_ODDS');
    if(odds!=null&&odds<cfg.oddsMinimum)reasons.push('ODDS_BELOW_MIN');
    if(odds!=null&&odds>cfg.oddsMaximum)reasons.push('ODDS_ABOVE_MAX');
    if(age==null)reasons.push('AGE_UNKNOWN');else if(age>cfg.maximumPriceAgeSeconds)reasons.push('STALE');
    return {...q,line,odds,priceAgeSeconds:age,status:reasons.length?'WAIT':'PASS',reasons};
  });
  const valid=checked.filter(q=>q.status==='PASS').sort((a,b)=>(b.odds??0)-(a.odds??0));
  return {passed:Boolean(valid[0]),selected:valid[0]||null,checked,reason:valid[0]?'BEST_VALID_PRICE':'NO_VALID_PRICE'};
}

function addHistory(state,m,observedAt,cfg){
  const id=String(m.id),list=Array.isArray(state.history[id])?state.history[id]:[];
  const snap={at:Date.parse(observedAt)||Date.now(),minute:m.minute,stats:m.stats};
  const last=list[list.length-1];
  if(!last||snap.at>last.at)list.push(snap);else list[list.length-1]=snap;
  if(list.length>cfg.maxHistoryPerFixture)list.splice(0,list.length-cfg.maxHistoryPerFixture);
  state.history[id]=list;
  return {list,current:snap};
}

function deriveMatch(m,state,observedAt,cfg){
  const {list,current}=addHistory(state,m,observedAt,cfg);
  const rolling=rollingFor(m,list,cfg,current);
  const side=String(cfg.targetSideMode).toUpperCase()==='AWAY'?'away':'home';
  const evidence=evidenceFor(rolling,side,cfg),hunger=hungerFor(rolling,side,cfg),market=inspectPrice(m,side,cfg,current.at);
  const minutePass=m.minute!=null&&m.minute>=cfg.minuteFrom&&m.minute<=cfg.minuteTo;
  const scorePass=!cfg.scoreDifferenceFilterEnabled||Math.abs(m.score.home-m.score.away)<=cfg.maxScoreDifference;
  const checks={homeOnly:side==='home',minute:minutePass,score:scorePass,hunger:hunger.passed,evidence:evidence.passed,market:market.passed};
  const passed=Object.values(checks).filter(Boolean).length,total=Object.keys(checks).length,candidate=passed===total;
  const prior=state.locked[m.id]||null;
  let signalLock=prior;
  if(candidate&&market.selected&&!prior){
    signalLock={status:'LOCKED',selection:side,minute:m.minute,entryScore:{...m.score},line:market.selected.line,odds:market.selected.odds,oddsSource:market.selected.source||'5USD',bookmaker:market.selected.bookmaker||'—',lockedAt:observedAt};
    state.locked[m.id]=signalLock;
  }
  const stateName=signalLock?'SIGNAL':candidate?'NEAR SIGNAL':passed>=total-1?'NEAR SIGNAL':'WATCHING';
  return {...m,side,rolling,evidence,hunger,checks,passed,total,candidate,state:stateName,priceSources:market.checked,selectedPrice:market.selected,signalStatus:signalLock?'LOCKED':null,signalLock};
}

function counts(matches){return {live:matches.length,watching:matches.filter(m=>m.state==='WATCHING').length,near:matches.filter(m=>m.state==='NEAR SIGNAL').length,candidate:matches.filter(m=>m.candidate).length,signal:matches.filter(m=>m.state==='SIGNAL').length};}

export function createRuntimeState(input={}){
  return {history:input.history&&typeof input.history==='object'?input.history:{},locked:input.locked&&typeof input.locked==='object'?input.locked:{},ledger:Array.isArray(input.ledger)?input.ledger:[],lastGoodSnapshot:input.lastGoodSnapshot||null,cycleNumber:Number(input.cycleNumber)||0,last429:input.last429||null};
}

export function processFullBoard(payload,stateInput={},options={}){
  const cfg={...DEFAULTS,...(options.config||{})},state=createRuntimeState(stateInput),observedAt=options.observedAt||new Date().toISOString();
  const rows=Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.fixtures)?payload.fixtures:[];
  const normalized=rows.map(f=>normalizeFixture(f,observedAt)).filter(m=>m.id);
  const matches=normalized.map(m=>deriveMatch(m,state,observedAt,cfg));
  state.cycleNumber+=1;
  const snapshot={
    cycleId:`341-${Date.parse(observedAt)||Date.now()}-${state.cycleNumber}`,
    fetchedAt:observedAt,updatedAt:observedAt,provider:options.provider||'MOCK_5USD',
    providerRequestCount:Number(options.providerRequestCount)||0,
    rateLimit:options.rateLimit||{limit:null,remaining:null,reset:null,retryAfter:null},
    hasMore:Boolean(payload?.pagination?.has_more),rawCount:rows.length,normalizedCount:matches.length,
    counts:counts(matches),matches,ledger:state.ledger,
    health:{
      state:'READY',environment:options.providerLive?'5USD STAGED LIVE':'STAGED MOCK',cycle:null,lastCycle:observedAt,lastSuccess:observedAt,configVersion:'central-runtime-v1',matches:matches.length,signals:matches.filter(m=>m.state==='SIGNAL').length,lastError:'—',
      sources:[
        {name:'5USD provider traffic',state:options.providerLive?'ENABLED':'DISABLED'},
        {name:'Provider requests this cycle',state:String(Number(options.providerRequestCount)||0)},
        {name:'Browser provider requests',state:'0 BY DESIGN'},
        {name:'Central rolling history',state:`${Object.keys(state.history).length} MATCHES`}
      ]
    }
  };
  snapshot.health.cycle=snapshot.cycleId;
  state.lastGoodSnapshot=snapshot;
  return {snapshot,state};
}

export const RUNTIME_DEFAULTS=DEFAULTS;
