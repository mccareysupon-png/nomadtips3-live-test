(()=>{
  const clone=window.NOMAD341Clone;
  if(!clone)return;

  const baseGetFeed=clone.getFeed.bind(clone);
  const baseGetHealth=clone.getHealth.bind(clone);
  const snapshots=new Map();
  const lockedMatches=new Set();
  const SAMPLE_MS=15000;
  const MAX_SNAPSHOTS=60;
  const DEFAULTS={
    minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,
    scoreDifferenceFilterEnabled:false,maxScoreDifference:2,
    attackWeight:1,dangerousAttackWeight:1,
    homePressureShareMinimum:55,trendConditionsRequired:'1',
    homeEventRequired:true,sotEvidenceEnabled:true,sotDeltaMinimum:1,
    shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,
    cornerEvidenceEnabled:true,cornerDeltaMinimum:1,evidenceMode:'ANY',
    targetSideMode:'HOME',allowedLinesMode:'ANY',oddsMinimum:1.50,
    oddsMaximum:6,maximumPriceAgeSeconds:90,oneSignalPerMatch:true
  };

  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const pair=(value,homeKeys=[],awayKeys=[])=>{
    if(value&&typeof value==='object'&&('home'in value||'away'in value))return {home:num(value.home)??0,away:num(value.away)??0};
    return {home:0,away:0};
  };
  const from=(obj,keys)=>{for(const key of keys){if(obj?.[key]!=null)return obj[key];}return null;};
  function config(){
    try{return {...DEFAULTS,...JSON.parse(localStorage.getItem('nomad341CloneSettingsV1')||'{}')}}catch{return {...DEFAULTS};}
  }
  function normalizedStats(m={}){
    const s=m.stats||m.statistics||{};
    return {
      attacks:pair(from(s,['attacks','attack'])),
      dangerousAttack:pair(from(s,['dangerousAttack','dangerous_attacks','dangerousAttacks'])),
      shotsOn:pair(from(s,['shotsOn','shots_on_target','shotsOnTarget'])),
      shotsOff:pair(from(s,['shotsOff','shots_off_target','shotsOffTarget'])),
      corners:pair(from(s,['corners'])||m.corners),
      possession:pair(from(s,['possession']))
    };
  }
  function snap(m,observedAt){
    return {id:String(m.id),at:Date.parse(observedAt)||Date.now(),minute:num(m.minute),stats:normalizedStats(m)};
  }
  function addSnapshot(s){
    const list=snapshots.get(s.id)||[];
    const last=list[list.length-1];
    if(!last||s.at-last.at>=SAMPLE_MS){list.push(s);if(list.length>MAX_SNAPSHOTS)list.splice(0,list.length-MAX_SNAPSHOTS);snapshots.set(s.id,list);}
    else list[list.length-1]=s;
    return snapshots.get(s.id)||[s];
  }
  function before(list,target){
    for(let i=list.length-1;i>=0;i--){if(list[i].at<=target)return list[i];}
    return null;
  }
  function deltaPair(a,b){return {home:Math.max(0,(a?.home??0)-(b?.home??0)),away:Math.max(0,(a?.away??0)-(b?.away??0))};}
  function statsDelta(a,b){
    return {
      attacks:deltaPair(a?.attacks,b?.attacks),
      dangerousAttack:deltaPair(a?.dangerousAttack,b?.dangerousAttack),
      shotsOn:deltaPair(a?.shotsOn,b?.shotsOn),
      shotsOff:deltaPair(a?.shotsOff,b?.shotsOff),
      corners:deltaPair(a?.corners,b?.corners)
    };
  }
  function pressureScore(d,side,cfg){
    return (d.attacks?.[side]??0)*(num(cfg.attackWeight)??1)
      +(d.dangerousAttack?.[side]??0)*(num(cfg.dangerousAttackWeight)??1)
      +(d.shotsOn?.[side]??0)*4
      +(d.shotsOff?.[side]??0)*2
      +(d.corners?.[side]??0)*3;
  }
  function pressureBlock(d,cfg){
    const home=pressureScore(d,'home',cfg),away=pressureScore(d,'away',cfg),sum=home+away;
    const homeShare=sum>0?home/sum*100:50,awayShare=100-homeShare;
    return {homeScore:home,awayScore:away,homeShare,awayShare,tempo:Math.round(clamp(sum*3,0,100))};
  }
  function chooseSide(m,rolling,cfg){
    const mode=String(cfg.targetSideMode||'HOME').toUpperCase();
    if(mode==='AWAY')return 'away';
    if(mode==='BOTH')return (rolling?.sides?.away?.pressureShare??0)>(rolling?.sides?.home?.pressureShare??0)?'away':'home';
    return String(m.side||'home').toLowerCase()==='away'&&mode!=='HOME'?'away':'home';
  }
  function priceAge(source,atMs){
    if(num(source?.priceAgeSeconds)!=null)return Math.max(0,num(source.priceAgeSeconds));
    const stamp=source?.sourceUpdatedAt||source?.updatedAt||source?.timestamp;
    const ms=stamp?Date.parse(stamp):NaN;
    return Number.isFinite(ms)?Math.max(0,(atMs-ms)/1000):null;
  }
  function rollingFor(m,list,cfg,current){
    const win=Math.max(1,num(cfg.rollingWindowMinutes)??5)*60000;
    const base1=before(list,current.at-win),base2=before(list,current.at-win*2);
    if(!base1||!base2){
      if(m.rolling)return {...m.rolling,available:m.rolling.available??false};
      return {available:false,windowMinutes:win/60000,recent:{homePressure:0,awayPressure:0,tempo:0,delta:{shotsOn:{home:0,away:0},shotsOff:{home:0,away:0},corners:{home:0,away:0}}},previous:{homePressure:0,awayPressure:0,tempo:0},sides:{home:{pressureShare:50},away:{pressureShare:50}}};
    }
    const recentDelta=statsDelta(current.stats,base1.stats),previousDelta=statsDelta(base1.stats,base2.stats);
    const recentP=pressureBlock(recentDelta,cfg),previousP=pressureBlock(previousDelta,cfg);
    return {
      available:true,windowMinutes:win/60000,
      recent:{homePressure:Number(recentP.homeScore.toFixed(2)),awayPressure:Number(recentP.awayScore.toFixed(2)),tempo:recentP.tempo,delta:{shotsOn:recentDelta.shotsOn,shotsOff:recentDelta.shotsOff,corners:recentDelta.corners},rawDelta:recentDelta},
      previous:{homePressure:Number(previousP.homeScore.toFixed(2)),awayPressure:Number(previousP.awayScore.toFixed(2)),tempo:previousP.tempo,rawDelta:previousDelta},
      sides:{home:{pressureShare:Number(recentP.homeShare.toFixed(1))},away:{pressureShare:Number(recentP.awayShare.toFixed(1))}}
    };
  }
  function evidenceFor(rolling,side,cfg){
    const d=rolling?.recent?.delta||{},enabled=[];
    if(cfg.sotEvidenceEnabled)enabled.push((d.shotsOn?.[side]??0)>=(num(cfg.sotDeltaMinimum)??1));
    if(cfg.shotOffEvidenceEnabled)enabled.push((d.shotsOff?.[side]??0)>=(num(cfg.shotOffDeltaMinimum)??1));
    if(cfg.cornerEvidenceEnabled)enabled.push((d.corners?.[side]??0)>=(num(cfg.cornerDeltaMinimum)??1));
    const mode=String(cfg.evidenceMode||'ANY').toUpperCase();
    const pass=!cfg.homeEventRequired?true:enabled.length?(mode==='ALL'?enabled.every(Boolean):enabled.some(Boolean)):false;
    return {required:Boolean(cfg.homeEventRequired),mode,enabledCount:enabled.length,passed:pass};
  }
  function hungerFor(rolling,side,cfg){
    const recent=rolling?.recent||{},previous=rolling?.previous||{},raw=recent.rawDelta||{};
    const share=rolling?.sides?.[side]?.pressureShare??0;
    const currentPressure=side==='away'?recent.awayPressure:recent.homePressure;
    const previousPressure=side==='away'?previous.awayPressure:previous.homePressure;
    const attacking=(raw.attacks?.[side]??0)+(raw.dangerousAttack?.[side]??0)+(raw.shotsOn?.[side]??0)*2;
    const conditions=[share>=(num(cfg.homePressureShareMinimum)??55),currentPressure>previousPressure,attacking>0];
    const passedCount=conditions.filter(Boolean).length,total=conditions.length,required=clamp(num(cfg.trendConditionsRequired)??1,1,total);
    return {passedCount,total,required,conditions,passed:rolling?.available?passedCount>=required:false};
  }
  function inspectMarket(m,side,cfg,atMs){
    const quotes=(Array.isArray(m.priceSources)?m.priceSources:[]).map((q,i)=>({...q,position:q.position??i+1,priceAgeSeconds:priceAge(q,atMs)}));
    let selected=m.selectedPrice?{...m.selectedPrice,priceAgeSeconds:priceAge(m.selectedPrice,atMs)}:null;
    const targetLine=num(m.selectionLine??m.market?.line??selected?.line??quotes.find(q=>num(q.line)!=null)?.line);
    if(window.NOMAD341PriceReferee&&quotes.length){
      const result=window.NOMAD341PriceReferee.inspect(quotes,{side,line:targetLine,minOdds:cfg.oddsMinimum,maxOdds:cfg.oddsMaximum,maxAgeSeconds:cfg.maximumPriceAgeSeconds});
      if(result.selected)selected=result.selected;
      return {quotes:result.checked,selected,passed:result.passed,result};
    }
    const odds=num(selected?.odds),age=priceAge(selected,atMs),passed=Boolean(selected&&num(selected.line)!=null&&odds!=null&&odds>=(num(cfg.oddsMinimum)??1.5)&&odds<=(num(cfg.oddsMaximum)??99)&&(age==null||age<=(num(cfg.maximumPriceAgeSeconds)??90)));
    return {quotes,selected,passed,result:{passed,selected}};
  }
  function applyRefereeResult(m,result,cfg,observedAt){
    if(!result?.passed||!result.selected||m.passed!==m.total)return m;
    const id=String(m.id),already=lockedMatches.has(id);
    if(cfg.oneSignalPerMatch&&already&&!m.signalLock)return m;
    lockedMatches.add(id);
    const q=result.selected;
    return {...m,state:'SIGNAL',signalStatus:'LOCKED',signalLock:m.signalLock||{status:'LOCKED',selection:m.side,minute:m.minute,entryScore:m.score,line:q.line,odds:q.odds,oddsSource:q.source||'5USD',bookmaker:q.bookmaker||'—',lockedAt:observedAt}};
  }
  function deriveMatch(m,observedAt,cfg){
    const current=snap(m,observedAt),list=addSnapshot(current),rolling=rollingFor(m,list,cfg,current),side=chooseSide(m,rolling,cfg),evidence=evidenceFor(rolling,side,cfg),hunger=hungerFor(rolling,side,cfg),market=inspectMarket(m,side,cfg,current.at);
    const minute=num(m.minute),minutePass=minute!=null&&minute>=(num(cfg.minuteFrom)??0)&&minute<=(num(cfg.minuteTo)??120);
    const hs=num(m.score?.home)??0,as=num(m.score?.away)??0,scorePass=!cfg.scoreDifferenceFilterEnabled||Math.abs(hs-as)<=(num(cfg.maxScoreDifference)??99);
    const mode=String(cfg.targetSideMode||'HOME').toUpperCase(),sidePass=mode==='BOTH'||(mode==='AWAY'&&side==='away')||(mode==='HOME'&&side==='home');
    const checks={};
    checks[side==='away'?'awayOnly':'homeOnly']=sidePass;
    checks.minute=minutePass;checks.score=scorePass;checks.hunger=hunger.passed;checks.evidence=evidence.passed;checks.market=market.passed;
    const passed=Object.values(checks).filter(Boolean).length,total=Object.keys(checks).length;
    let state=m.signalLock||m.signalStatus==='LOCKED'?'SIGNAL':passed>=Math.max(1,total-1)?'NEAR SIGNAL':'WATCHING';
    const candidate=passed===total;
    let out={...m,side,stats:current.stats,rolling,evidence,hunger,checks,passed,total,state,candidate,candidateReason:candidate?'AWAITING_PRICE_REFEREE':null,priceSources:market.quotes,selectedPrice:market.selected};
    if(m.refereeResult)out=applyRefereeResult(out,m.refereeResult,cfg,observedAt);
    return out;
  }
  function counts(matches){
    return {live:matches.length,watching:matches.filter(m=>m.state==='WATCHING').length,near:matches.filter(m=>m.state==='NEAR SIGNAL').length,signal:matches.filter(m=>m.state==='SIGNAL'||m.signalStatus==='LOCKED').length,candidate:matches.filter(m=>m.candidate).length};
  }
  async function getFeed(){
    const raw=await baseGetFeed();
    const observedAt=raw?.updatedAt||new Date().toISOString(),cfg=config();
    const matches=(raw?.matches||[]).map(m=>deriveMatch(m,observedAt,cfg));
    return {...raw,updatedAt:observedAt,cycleId:raw?.cycleId||`341-${Date.parse(observedAt)||Date.now()}`,counts:counts(matches),matches,derived:{version:'1.0-clean',snapshotMatches:snapshots.size,rollingWindowMinutes:cfg.rollingWindowMinutes}};
  }
  async function getHealth(){
    const h=await baseGetHealth();
    const extra=[{name:'Derived Engine',state:'READY'},{name:'Snapshot Memory',state:`${snapshots.size} MATCHES`},{name:'Price Referee',state:window.NOMAD341PriceReferee?'READY':'NOT LOADED'},{name:'AH Settlement',state:window.NOMAD341Settlement?'READY':'NOT LOADED'}];
    return {...h,state:h.state==='ERROR'?'ERROR':'UI + DERIVED READY',configVersion:'local-derived-v1',sources:[...(h.sources||[]),...extra]};
  }

  clone.getFeed=getFeed;
  clone.getHealth=getHealth;
  window.NOMAD341Derived={version:'1.0-clean',config,deriveMatch,applyRefereeResult,reset(){snapshots.clear();lockedMatches.clear();},snapshotCount:()=>snapshots.size};
})();
