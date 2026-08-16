const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const SOURCE_INDEX='https://live10.goaloo28.com/gf/data/bf_us.js';
const SOURCE_INDEX_ALT='https://live10.goaloo28.com/gf/data/bf_us1.js';
const SOURCE_STATS='https://live10.goaloo28.com/gf/data/detailIn.js';
const SOURCE_ODDS='https://live10.goaloo28.com/gf/data/odds/en/runOddsData_8.txt';
const SOURCE_EVENTS='https://live10.goaloo28.com/gf/data/detail.js';
const CORE_KEYS=['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'];
const DETAIL_MAP={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};
const DEFAULT_CONFIG={
  side:'HOME', minuteMin:60, minuteMax:80, market:'WIN', oddsMin:1.70, oddsMax:null,
  ahMin:0.25, ahMax:null, momentumMin:60, attackEvidenceEnabled:true,
  attackEvidenceDangerousAttacksEnabled:true, attackEvidenceDangerousAttacksMin:1,
  attackEvidenceShotsEnabled:true, attackEvidenceShotsMin:1,
  attackEvidenceShotsOnTargetEnabled:true, attackEvidenceShotsOnTargetMin:1,
  attackEvidenceCornersEnabled:true, attackEvidenceCornersMin:1,
  attackEvidenceRequirement:'1', goalGapLimited:false, maxGoalGap:1,
  confirmationRounds:2, signalLimitEnabled:false, maxSignalsPerDay:10,
  ouDirection:'OVER', ouLine:2.5, requireCoreStats:true, redCardPolicy:'ALLOW',
  momentumWeights:{attacks:.16,dangerous_attacks:.52,shots:2,shots_on_target:4,corners:1.25,possession:.07}
};

const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const clamp=(v,f,min,max)=>{const n=num(v);return n===null?f:Math.max(min,Math.min(max,n));};
const bool=(v,f=false)=>typeof v==='boolean'?v:(v==='true'||v===1||v==='1'?true:(v==='false'||v===0||v==='0'?false:f));
const enumv=(v,allowed,f)=>{const s=String(v??f).toUpperCase();return allowed.includes(s)?s:f;};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});

export function normalizeConfig(input={}){
  const s=input&&typeof input==='object'?input:{};
  const minuteMin=Math.round(clamp(s.minuteMin,DEFAULT_CONFIG.minuteMin,1,119));
  const minuteMax=Math.round(clamp(s.minuteMax,DEFAULT_CONFIG.minuteMax,minuteMin,120));
  const oddsMin=clamp(s.oddsMin,DEFAULT_CONFIG.oddsMin,1.01,100);
  const ahMin=clamp(s.ahMin,DEFAULT_CONFIG.ahMin,-5,5);
  return {
    ...DEFAULT_CONFIG,
    side:enumv(s.side,['HOME','AWAY','BOTH'],DEFAULT_CONFIG.side), minuteMin, minuteMax,
    market:enumv(s.market,['WIN','AH','OU'],DEFAULT_CONFIG.market), oddsMin,
    oddsMax:num(s.oddsMax), ahMin, ahMax:num(s.ahMax), momentumMin:Math.round(clamp(s.momentumMin,60,1,99)),
    attackEvidenceEnabled:bool(s.attackEvidenceEnabled,true),
    attackEvidenceDangerousAttacksEnabled:bool(s.attackEvidenceDangerousAttacksEnabled,true),
    attackEvidenceDangerousAttacksMin:Math.round(clamp(s.attackEvidenceDangerousAttacksMin,1,1,999)),
    attackEvidenceShotsEnabled:bool(s.attackEvidenceShotsEnabled,true), attackEvidenceShotsMin:Math.round(clamp(s.attackEvidenceShotsMin,1,1,999)),
    attackEvidenceShotsOnTargetEnabled:bool(s.attackEvidenceShotsOnTargetEnabled,true), attackEvidenceShotsOnTargetMin:Math.round(clamp(s.attackEvidenceShotsOnTargetMin,1,1,999)),
    attackEvidenceCornersEnabled:bool(s.attackEvidenceCornersEnabled,true), attackEvidenceCornersMin:Math.round(clamp(s.attackEvidenceCornersMin,1,1,999)),
    attackEvidenceRequirement:enumv(s.attackEvidenceRequirement,['1','2','3','ALL'],'1'),
    goalGapLimited:bool(s.goalGapLimited,false), maxGoalGap:Math.round(clamp(s.maxGoalGap,1,0,20)),
    confirmationRounds:Math.round(clamp(s.confirmationRounds,2,1,10)), signalLimitEnabled:bool(s.signalLimitEnabled,false),
    maxSignalsPerDay:Math.round(clamp(s.maxSignalsPerDay,10,1,100)),
    ouDirection:enumv(s.ouDirection,['OVER','UNDER'],'OVER'), ouLine:clamp(s.ouLine,2.5,.5,8.5),
    requireCoreStats:bool(s.requireCoreStats,true), redCardPolicy:enumv(s.redCardPolicy,['ALLOW','REJECT_SELECTED','REJECT_ANY'],'ALLOW'),
    momentumWeights:{
      attacks:clamp(s.momentumWeights?.attacks,.16,0,20), dangerous_attacks:clamp(s.momentumWeights?.dangerous_attacks,.52,0,20),
      shots:clamp(s.momentumWeights?.shots,2,0,20), shots_on_target:clamp(s.momentumWeights?.shots_on_target,4,0,20),
      corners:clamp(s.momentumWeights?.corners,1.25,0,20), possession:clamp(s.momentumWeights?.possession,.07,0,2)
    }
  };
}

function scalar(raw){
  const value=String(raw??'').trim();
  if(!value||value==='null'||value==='undefined')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(/^(true|false)$/i.test(value))return value.toLowerCase()==='true';
  return value;
}
function splitJsArray(body){
  const out=[];let token='',quote=null,escape=false;
  for(const ch of String(body||'')){
    if(quote){if(escape){token+=ch;escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(ch===quote){quote=null;continue;}token+=ch;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch===','){out.push(scalar(token));token='';continue;}token+=ch;
  }
  out.push(scalar(token));return out;
}
function arrays(source,name){
  const out=new Map(),re=new RegExp(`${name}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');
  for(const m of String(source||'').matchAll(re))out.set(Number(m[1]),splitJsArray(m[2]));
  return out;
}
function parseSourceTime(value){
  const text=String(value??'').trim();if(!text)return null;
  const ms=Date.parse(text.replace(' ','T')+'Z');return Number.isFinite(ms)?ms:null;
}
export function parseLiveIndex(source){
  const A=arrays(source,'A'),B=arrays(source,'B'),all=[];
  for(const [,row] of A){
    const id=String(row[0]??'').trim(),stateCode=num(row[8]);if(!id||stateCode===null)continue;
    const leagueRow=B.get(num(row[1]))||[],sourceStart=String(row[6]??''),sourceClock=String(row[7]??'');
    const startMs=parseSourceTime(sourceStart),clockMs=parseSourceTime(sourceClock);
    let elapsedSeconds=null;
    if(stateCode===2)elapsedSeconds=45*60;
    else if(stateCode>0&&startMs!==null&&clockMs!==null&&clockMs>=startMs)elapsedSeconds=Math.max(0,Math.min(120*60,Math.round((clockMs-startMs)/1000)));
    const status=stateCode===2?'HT':stateCode>0?'LIVE':stateCode===-1?'FT':'SCHEDULED';
    all.push({
      id,sourceMatchId:id,league:String(leagueRow[2]??'NOMADTIPS3 Live'),leagueId:leagueRow[0]??null,
      home:String(row[4]??''),away:String(row[5]??''),status,stateCode,kickoffUtc:sourceStart||null,
      sourceStart,sourceClock,elapsedSeconds,minute:elapsedSeconds===null?null:Math.floor(elapsedSeconds/60),
      score:{home:num(row[9])??0,away:num(row[10])??0},
      redCards:{home:num(row[13])??0,away:num(row[14])??0},yellowCards:{home:num(row[15])??0,away:num(row[16])??0}
    });
  }
  return {all,live:all.filter(x=>x.stateCode>0)};
}

export function parseStats(source){
  const out=new Map(),assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(assignment)){
    const stats={},rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of m[2].matchAll(rowRe)){
      const key=DETAIL_MAP[Number(row[1])];if(!key)continue;
      const home=num(row[2]),away=num(row[3]);if(home!==null&&away!==null)stats[key]={home,away};
    }
    if(Object.keys(stats).length)out.set(String(m[1]),stats);
  }
  return out;
}
function marketOdd(raw,market){const v=num(raw);if(v===null)return null;if(market==='1X2')return v;return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;}
export function parseOdds(source){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;const parts=raw.split('!'),id=String(parts.shift()||'').trim();if(!/^\d+$/.test(id))continue;
    const rows=parts.map(p=>String(p).split(',').map(x=>num(x))),ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    out.set(id,{
      oneXtwo:one.length>=3?{home:marketOdd(one[0],'1X2'),draw:marketOdd(one[1],'1X2'),away:marketOdd(one[2],'1X2')}:null,
      asianHandicap:ah.length>=3?{home:marketOdd(ah[0],'AH'),line:num(ah[1]),away:marketOdd(ah[2],'AH')}:null,
      overUnder:ou.length>=3?{over:marketOdd(ou[0],'OU'),line:num(ou[1]),under:marketOdd(ou[2],'OU')}:null
    });
  }
  return out;
}
export function parseEvents(source){
  const out=new Map(),re=/rq\[\d+\]\s*=\s*["']([^"']*)["']\s*;?/g;
  for(const m of String(source||'').matchAll(re)){
    const p=m[1].split('^'),id=String(p[0]||'').trim();if(!id)continue;
    const code=num(p[2]),minute=num(String(p[3]||'').replace(/[^\d]/g,''));
    const event={team:String(p[1]||'0')==='1'?'AWAY':'HOME',code,minute,type:code===1?'GOAL':code===11?'SUBSTITUTION':`EVENT ${code??'?'}`,detail:String(p[4]||'').trim()};
    if(!out.has(id))out.set(id,[]);out.get(id).push(event);
  }
  for(const list of out.values())list.sort((a,b)=>(b.minute??-1)-(a.minute??-1));
  return out;
}

function complete(stats){return CORE_KEYS.every(k=>num(stats?.[k]?.home)!==null&&num(stats?.[k]?.away)!==null);}
function pressure(stats,w){let h=0,a=0;for(const [k,wt] of Object.entries(w)){h+=(num(stats?.[k]?.home)||0)*wt;a+=(num(stats?.[k]?.away)||0)*wt;}const total=Math.max(.0001,h+a);return{home:Math.round(h/total*100),away:Math.round(a/total*100)};}
function pair(obj,side){return side==='AWAY'?{selected:num(obj?.away)||0,opponent:num(obj?.home)||0}:{selected:num(obj?.home)||0,opponent:num(obj?.away)||0};}
function chooseSide(match,config,p){if(config.side==='HOME'||config.side==='AWAY')return config.side;return p.away>p.home?'AWAY':'HOME';}
function dateKey(iso){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}

export function evaluateMatch(match,config,baseline){
  const p=pressure(match.stats,config.momentumWeights),side=chooseSide(match,config,p),momentum=side==='AWAY'?p.away:p.home;
  const cur={dangerous:pair(match.stats?.dangerous_attacks,side).selected,shots:pair(match.stats?.shots,side).selected,sot:pair(match.stats?.shots_on_target,side).selected,corners:pair(match.stats?.corners,side).selected};
  const base=baseline||cur,evidence={dangerous:cur.dangerous-base.dangerous,shots:cur.shots-base.shots,sot:cur.sot-base.sot,corners:cur.corners-base.corners};
  const rules=[
    [config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],
    [config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],
    [config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],
    [config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]
  ].filter(x=>x[0]);
  const passed=rules.filter(x=>x[1]>=x[2]).length,required=config.attackEvidenceRequirement==='ALL'?rules.length:Number(config.attackEvidenceRequirement);
  const score=pair(match.score,side),red=pair(match.stats?.red_cards||match.redCards,side),gap=Math.abs(score.selected-score.opponent);
  let rawLine=null,selectedLine=null,odds=null;
  if(config.market==='WIN')odds=match.odds?.oneXtwo?.[side==='AWAY'?'away':'home']??null;
  else if(config.market==='AH'){
    rawLine=match.odds?.asianHandicap?.line??null;
    selectedLine=rawLine===null?null:(side==='AWAY'?-rawLine:rawLine);
    odds=match.odds?.asianHandicap?.[side==='AWAY'?'away':'home']??null;
  }else{
    rawLine=match.odds?.overUnder?.line??config.ouLine;selectedLine=rawLine;
    odds=match.odds?.overUnder?.[config.ouDirection==='OVER'?'over':'under']??null;
  }
  const oddsOk=num(odds)!==null&&num(odds)>=config.oddsMin&&(config.oddsMax===null||num(odds)<=config.oddsMax);
  const ahOk=config.market!=='AH'||(selectedLine!==null&&selectedLine>=config.ahMin&&(config.ahMax===null||selectedLine<=config.ahMax));
  const redOk=config.redCardPolicy==='ALLOW'||(config.redCardPolicy==='REJECT_SELECTED'?red.selected===0:(red.selected===0&&red.opponent===0));
  const gates={
    minute:match.minute!==null&&match.minute>=config.minuteMin&&match.minute<=config.minuteMax,
    coreStats:!config.requireCoreStats||complete(match.stats), marketOdds:oddsOk&&ahOk, momentum:momentum>=config.momentumMin,
    evidence:!config.attackEvidenceEnabled||passed>=required, goalGap:!config.goalGapLimited||gap<=config.maxGoalGap, redCard:redOk
  };
  const pass=Object.values(gates).every(Boolean);
  return {pass,side,momentum,evidence,gates,rawLine,selectedLine,odds,selectedTeam:side==='AWAY'?match.away:match.home,entryScore:{...match.score}};
}

export function buildSignalRecord(match,evaluation,snapshotId,detectedAt){
  const elapsed=num(match.elapsedSeconds);
  return {
    id:String(match.id),snapshotId,selectedTeam:evaluation.selectedTeam,selectedSide:evaluation.side,
    home:match.home,away:match.away,league:match.league,market:evaluation.market||null,
    linePerspective:'SELECTED',rawLine:evaluation.rawLine,selectedLine:evaluation.selectedLine,lockedOdds:evaluation.odds,odds:evaluation.odds,
    ouDirection:evaluation.ouDirection||null,signalElapsedSeconds:elapsed,entryMinute:elapsed===null?match.minute:Math.floor(elapsed/60),
    entryScore:{...match.score},selectedAt:detectedAt,sourceClockAtSignal:match.sourceClock,sourceStartAtSignal:match.sourceStart,
    momentum:evaluation.momentum,evidence:evaluation.evidence,gates:evaluation.gates,result:'PENDING',resultDetail:'PENDING',settledAt:null,finalScore:null
  };
}

function quarterParts(line){const q=Math.round(line*4);if(q%2===0)return[line];const lo=Math.floor(q/2)/2,hi=Math.ceil(q/2)/2;return[lo,hi];}
function grade(v){return v>0?'WIN':v<0?'LOSS':'DRAW';}
export function settleRecord(record,finalScore){
  const side=String(record.selectedSide||'HOME').toUpperCase(),sel=side==='AWAY'?finalScore.away:finalScore.home,opp=side==='AWAY'?finalScore.home:finalScore.away;
  if(record.market==='WIN'){
    const r=grade(sel-opp);return{result:r,resultDetail:r==='WIN'?'FULL WIN':r==='LOSS'?'FULL LOSS':'PUSH'};
  }
  if(record.market==='OU'){
    const line=num(record.selectedLine),total=(num(finalScore.home)||0)+(num(finalScore.away)||0);if(line===null)return{result:'DRAW',resultDetail:'VOID'};
    const diff=String(record.ouDirection||'OVER').toUpperCase()==='UNDER'?line-total:total-line;const r=grade(diff);return{result:r,resultDetail:r==='WIN'?'FULL WIN':r==='LOSS'?'FULL LOSS':'PUSH'};
  }
  const line=num(record.selectedLine);if(line===null)return{result:'DRAW',resultDetail:'VOID'};
  const entry=record.entryScore||{},entrySel=side==='AWAY'?num(entry.away):num(entry.home),entryOpp=side==='AWAY'?num(entry.home):num(entry.away);
  if(entrySel===null||entryOpp===null)return{result:'DRAW',resultDetail:'VOID'};
  const postSel=sel-entrySel,postOpp=opp-entryOpp,parts=quarterParts(line),grades=parts.map(x=>grade(postSel-postOpp+x));
  if(grades.length===1){const r=grades[0];return{result:r,resultDetail:r==='WIN'?'FULL WIN':r==='LOSS'?'FULL LOSS':'PUSH'};}
  const wins=grades.filter(x=>x==='WIN').length,losses=grades.filter(x=>x==='LOSS').length,draws=grades.filter(x=>x==='DRAW').length;
  if(wins===2)return{result:'WIN',resultDetail:'FULL WIN'};if(losses===2)return{result:'LOSS',resultDetail:'FULL LOSS'};
  if(wins===1&&draws===1)return{result:'WIN',resultDetail:'HALF WIN'};if(losses===1&&draws===1)return{result:'LOSS',resultDetail:'HALF LOSS'};
  return{result:'DRAW',resultDetail:'PUSH'};
}

async function sourceText(url,ttl=5){
  const bucket=Math.floor(Date.now()/(ttl*1000));
  const r=await fetch(`${url}?c33=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-Live/3.3','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:ttl,cacheEverything:true}});
  if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return r.text();
}
async function collect(){
  let indexSource=null,indexError=null;
  for(const url of [SOURCE_INDEX,SOURCE_INDEX_ALT]){try{indexSource=await sourceText(url,5);if(indexSource)break;}catch(e){indexError=String(e?.message||e);}}
  if(!indexSource)throw new Error(indexError||'Live index unavailable');
  const [statsSource,oddsSource,eventsSource]=await Promise.all([sourceText(SOURCE_STATS,5),sourceText(SOURCE_ODDS,5),sourceText(SOURCE_EVENTS,5).catch(()=>"")]);
  const index=parseLiveIndex(indexSource),stats=parseStats(statsSource),odds=parseOdds(oddsSource),events=parseEvents(eventsSource);
  const observedAt=new Date().toISOString(),snapshotId=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const all=index.all.map(seed=>{
    const s=stats.get(seed.id)||{},fullStats={...s,red_cards:seed.redCards,yellow_cards:seed.yellowCards};
    return {...seed,stats:fullStats,coreStatsComplete:complete(fullStats),odds:odds.get(seed.id)||{oneXtwo:null,asianHandicap:null,overUnder:null},events:events.get(seed.id)||[],observedAt,snapshotId};
  });
  return {snapshotId,observedAt,all,matches:all.filter(x=>x.stateCode>0)};
}

function baselineValues(match,side){return{dangerous:pair(match.stats?.dangerous_attacks,side).selected,shots:pair(match.stats?.shots,side).selected,sot:pair(match.stats?.shots_on_target,side).selected,corners:pair(match.stats?.corners,side).selected};}

export class Car33State{
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    const url=new URL(request.url);
    if(url.pathname==='/scan')return this.scan('manual');
    if(url.pathname==='/health')return this.health();
    if(url.pathname==='/config'){
      if(request.method==='POST')return this.saveConfig(await request.json().catch(()=>({})));
      return json({config:await this.config()});
    }
    if(url.pathname==='/history')return this.history(url);
    if(url.pathname==='/live')return this.live();
    return json({engine:'CAR 3.3',routes:['/live','/history','/config','/health','/scan']});
  }
  async config(){return normalizeConfig((await this.state.storage.get('config'))||{});}
  async saveConfig(input){const config=normalizeConfig(input);await this.state.storage.put('config',config);return json({ok:true,config});}
  async health(){
    const last=await this.state.storage.get('lastCycle'),history=(await this.state.storage.get('history'))||[];
    return json({ok:Boolean(last?.ok),engine:'CAR 3.3',lastCycle:last||null,signals:history.length});
  }
  async live(){
    const last=await this.state.storage.get('lastCycle'),stale=!last?.atMs||Date.now()-last.atMs>5000;
    if(stale)await this.scan('live-read');
    const latest=(await this.state.storage.get('latest'))||{snapshotId:null,observedAt:null,matches:[]};
    const history=(await this.state.storage.get('history'))||[],activeIds=new Set(latest.matches.map(x=>String(x.id)));
    const activeSignals=history.filter(r=>r.result==='PENDING'&&activeIds.has(String(r.id)));
    return json({...latest,activeSignals,serverNowMs:Date.now()});
  }
  async history(url){
    const history=(await this.state.storage.get('history'))||[],page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')||25)));
    const start=(page-1)*limit,records=history.slice().sort((a,b)=>Date.parse(b.selectedAt)-Date.parse(a.selectedAt));
    const settled=records.filter(r=>r.result!=='PENDING'),wins=settled.filter(r=>r.result==='WIN').length,losses=settled.filter(r=>r.result==='LOSS').length,draws=settled.filter(r=>r.result==='DRAW').length;
    const avgOdds=settled.length?settled.reduce((s,r)=>s+(num(r.lockedOdds)||0),0)/settled.length:null;
    return json({records:records.slice(start,start+limit),total:records.length,page,limit,summary:{total:records.length,win:wins,loss:losses,draw:draws,pending:records.length-settled.length,winRate:settled.length?wins/settled.length*100:null,averageOdds:avgOdds}});
  }
  async scan(trigger='cron'){
    const started=Date.now();
    try{
      const [snapshot,config,history0,confirmations0,baselines0]=await Promise.all([collect(),this.config(),this.state.storage.get('history'),this.state.storage.get('confirmations'),this.state.storage.get('baselines')]);
      const history=Array.isArray(history0)?history0:[],confirmations=confirmations0||{},baselines=baselines0||{},today=dateKey(snapshot.observedAt);
      const existing=new Map(history.map(r=>[String(r.id),r]));
      const candidates=[];
      for(const match of snapshot.matches){
        if(match.minute===null)continue;
        const p=pressure(match.stats,config.momentumWeights),side=chooseSide(match,config,p),baseKey=`${match.id}:${side}`;
        if(match.minute>=config.minuteMin&&!baselines[baseKey]&&complete(match.stats))baselines[baseKey]=baselineValues(match,side);
        const evaluation=evaluateMatch(match,config,baselines[baseKey]);evaluation.market=config.market;evaluation.ouDirection=config.ouDirection;
        candidates.push({id:match.id,decision:evaluation.pass?'CONFIRMING':evaluation.momentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',selectedSide:evaluation.side,selectedTeam:evaluation.selectedTeam,momentum:evaluation.momentum,evidence:evaluation.evidence,gates:evaluation.gates,line:evaluation.selectedLine,odds:evaluation.odds});
        if(existing.has(String(match.id)))continue;
        confirmations[match.id]=evaluation.pass?(Number(confirmations[match.id]||0)+1):0;
        const todayCount=history.filter(r=>dateKey(r.selectedAt)===today).length;
        const limitOk=!config.signalLimitEnabled||todayCount<config.maxSignalsPerDay;
        if(evaluation.pass&&confirmations[match.id]>=config.confirmationRounds&&limitOk){
          const record=buildSignalRecord(match,evaluation,snapshot.snapshotId,snapshot.observedAt);record.market=config.market;record.ouDirection=config.ouDirection;history.push(record);existing.set(String(match.id),record);confirmations[match.id]=0;
        }
      }
      for(const match of snapshot.all.filter(x=>x.status==='FT')){
        const record=existing.get(String(match.id));if(!record||record.result!=='PENDING')continue;
        const graded=settleRecord(record,match.score);record.result=graded.result;record.resultDetail=graded.resultDetail;record.finalScore={...match.score};record.settledAt=snapshot.observedAt;
      }
      const livePayload={engine:'CAR 3.3',snapshotId:snapshot.snapshotId,observedAt:snapshot.observedAt,matches:snapshot.matches,candidates};
      const lastCycle={ok:true,trigger,at:snapshot.observedAt,atMs:Date.now(),durationMs:Date.now()-started,liveMatches:snapshot.matches.length,candidates:candidates.length,signals:history.length};
      await this.state.storage.put({latest:livePayload,history:history.slice(-1000),confirmations,baselines,lastCycle});
      return json(lastCycle);
    }catch(error){
      const lastCycle={ok:false,trigger,at:new Date().toISOString(),atMs:Date.now(),durationMs:Date.now()-started,error:String(error?.message||error)};await this.state.storage.put('lastCycle',lastCycle);return json(lastCycle,502);
    }
  }
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    const id=env.CAR33_STATE.idFromName('engine');return env.CAR33_STATE.get(id).fetch(request);
  },
  async scheduled(event,env,ctx){
    const id=env.CAR33_STATE.idFromName('engine');ctx.waitUntil(env.CAR33_STATE.get(id).fetch('https://car33.internal/scan'));
  }
};
