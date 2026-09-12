import { DurableObject } from 'cloudflare:workers';
import { MARKET_RULES, MARKET_KEYS, cardPointsPair, gapPass, lineGap, settleMarketSignal } from './market-core.js';

const VERSION='nomad343-engine-v3-settlement-safe';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const MIN_SCAN_GAP_MS=60_000;
const HISTORY_MS=180*60_000;
const MAX_HISTORY_ROWS=180;
const MAX_SIGNALS=1600;
const MAX_ODDS_FIXTURES_PER_SCAN=4;
const SETTLEMENT_REVISION='bet365-rules-v2';

const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const now=()=>Date.now();
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};

const COMMON_HIGH={shotOnTarget:1,shotOff:1,corner:1,attackPct:55,dangerousAttackPct:55,possessionPct:50,evidenceRequired:3,oddsMin:1.50,oddsMax:9.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10};
const COMMON_LOW={shotOnTarget:1,shotOff:1,corner:1,attackPct:45,dangerousAttackPct:45,possessionPct:50,evidenceRequired:3,oddsMin:1.50,oddsMax:9.00,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10};
const HALF_HIGH={...COMMON_HIGH,minuteFrom:20,minuteTo:45};
const HALF_LOW={...COMMON_LOW,minuteFrom:20,minuteTo:45};

const DEFAULTS={
  ft_1x2:{...COMMON_HIGH,sideMode:'BOTH',scoreTrailingMax:1},
  ft_ah:{...COMMON_HIGH,sideMode:'BOTH',lineMin:-10,lineMax:10},
  ft_over:{...COMMON_HIGH,lineMin:0.5,lineGapMax:0.5},
  ft_under:{...COMMON_LOW,lineMin:0.5,lineMax:20},
  ht_1x2:{...HALF_HIGH,sideMode:'BOTH',scoreTrailingMax:1},
  ht_ah:{...HALF_HIGH,sideMode:'BOTH',lineMin:-10,lineMax:10},
  ht_over:{...HALF_HIGH,lineMin:0.5,lineGapMax:0.5},
  ht_under:{...HALF_LOW,lineMin:0.5,lineMax:20},
  ft_corner_over:{...COMMON_HIGH,lineMin:0.5,lineGapMax:0.5},
  ft_corner_under:{...COMMON_LOW,lineMin:0.5,lineMax:30},
  ht_corner_over:{...HALF_HIGH,lineMin:0.5,lineGapMax:0.5},
  ht_corner_under:{...HALF_LOW,lineMin:0.5,lineMax:20},
  ft_corner_ah:{...COMMON_HIGH,sideMode:'BOTH',lineMin:-20,lineMax:20},
  ft_cards_over:{...COMMON_HIGH,lineMin:0.5,lineGapMax:0.5},
  ft_cards_under:{...COMMON_LOW,lineMin:0.5,lineMax:30},
  ft_cards_ah:{...COMMON_HIGH,sideMode:'BOTH',lineMin:-20,lineMax:20},
  ft_btts_yes:{...COMMON_HIGH},
  ft_btts_no:{...COMMON_LOW}
};
const DEFAULT_RUN=Object.fromEntries(MARKET_KEYS.map(k=>[k,false]));

function migrateLegacySettings(raw={}){
  const out={...raw};
  if(raw.oneXtwo&&!out.ft_1x2) out.ft_1x2={...raw.oneXtwo};
  if(raw.ah&&!out.ft_ah) out.ft_ah={...raw.ah};
  if(raw.over&&!out.ft_over) out.ft_over={...raw.over,lineGapMax:num(raw.over.lineGapMax)??0.5};
  if(raw.under&&!out.ft_under) out.ft_under={...raw.under};
  return out;
}
function migrateLegacyRun(raw={}){
  const out={...raw};
  if(Object.prototype.hasOwnProperty.call(raw,'oneXtwo')&&!Object.prototype.hasOwnProperty.call(out,'ft_1x2')) out.ft_1x2=Boolean(raw.oneXtwo);
  if(Object.prototype.hasOwnProperty.call(raw,'ah')&&!Object.prototype.hasOwnProperty.call(out,'ft_ah')) out.ft_ah=Boolean(raw.ah);
  if(Object.prototype.hasOwnProperty.call(raw,'over')&&!Object.prototype.hasOwnProperty.call(out,'ft_over')) out.ft_over=Boolean(raw.over);
  if(Object.prototype.hasOwnProperty.call(raw,'under')&&!Object.prototype.hasOwnProperty.call(out,'ft_under')) out.ft_under=Boolean(raw.under);
  return out;
}
function sanitizeSettings(raw={}){
  const src=migrateLegacySettings(raw),out={};
  for(const key of MARKET_KEYS){
    const base=DEFAULTS[key]||COMMON_HIGH,c={...base,...(src[key]||{})};
    if('lineGapMax' in c&&![0.5,1,1.5,2,2.5,999].includes(Number(c.lineGapMax))) c.lineGapMax=base.lineGapMax??0.5;
    c.evidenceRequired=Math.max(1,Math.min(6,Math.round(num(c.evidenceRequired)??base.evidenceRequired??3)));
    c.minuteFrom=Math.max(0,Math.min(120,Math.round(num(c.minuteFrom)??base.minuteFrom??0)));
    c.minuteTo=Math.max(c.minuteFrom,Math.min(120,Math.round(num(c.minuteTo)??base.minuteTo??120)));
    c.rollingWindowMinutes=Math.max(2,Math.min(30,Math.round(num(c.rollingWindowMinutes)??10)));
    c.oddsMin=Math.max(1.01,num(c.oddsMin)??1.5);
    c.oddsMax=Math.max(c.oddsMin,num(c.oddsMax)??9);
    if('sideMode' in base){const m=String(c.sideMode||base.sideMode).toUpperCase();c.sideMode=['HOME','AWAY','DRAW','BOTH','ALL'].includes(m)?m:base.sideMode;}
    out[key]=c;
  }
  return out;
}
function sanitizeRun(raw={}){const src=migrateLegacyRun(raw);return Object.fromEntries(MARKET_KEYS.map(k=>[k,Boolean(src[k]??DEFAULT_RUN[k])]))}

function fixtureStatus(f){return String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase()}
function isLive(f){const s=fixtureStatus(f);return f?.boardState==='live'||/live|in_play|in play|playing|first|second|\b1h\b|\b2h\b|\bhalf\b/.test(s)}
function isFinished(f){const s=fixtureStatus(f);return f?.boardState==='finished'||/finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s)}
function isUnknown(f){const s=fixtureStatus(f);return f?.boardState==='unknown'||/unknown/.test(s)}
function isHalfComplete(f){
  if(isFinished(f))return true;
  const raw=`${f?.status??''} ${f?.statusCode??''}`.toLowerCase(),minute=num(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw)||(minute!==null&&minute>=46);
}
function periodEligible(f,def,cfg){
  const minute=num(f?.minute);
  if(minute===null||minute<Number(cfg.minuteFrom)||minute>Number(cfg.minuteTo)) return false;
  if(def.period==='HT'&&isHalfComplete(f))return false;
  return true;
}
function periodCompleteForSignal(s,f){const def=MARKET_RULES[s?.market];if(!def)return false;return def.period==='HT'?isHalfComplete(f):isFinished(f)}

function cardPair(cards){return cardPointsPair(cards)}
function totalPair(p){const h=num(p?.home),a=num(p?.away);return h===null||a===null?null:h+a}
function currentBasisTotal(f,basis){
  if(basis==='goals')return totalPair(pair(f?.goals));
  if(basis==='corners')return totalPair(pair(f?.corners));
  if(basis==='cards')return totalPair(cardPair(f?.cards));
  return null;
}
function metricSnapshot(f,at){return {at,minute:num(f.minute),shotsOnTarget:pair(f.statistics?.shotsOnTarget),shotsOffTarget:pair(f.statistics?.shotsOffTarget),corners:pair(f.corners),attacks:pair(f.statistics?.attacks),dangerousAttacks:pair(f.statistics?.dangerousAttacks),possession:pair(f.statistics?.possession),goals:pair(f.goals),cards:cardPair(f.cards)}}
function delta(a,b){a=num(a);b=num(b);return a===null||b===null||a<b?null:a-b}
function deltaPair(cur,old){return {home:delta(cur?.home,old?.home),away:delta(cur?.away,old?.away)}}
function sharePair(p){const h=num(p?.home),a=num(p?.away);if(h===null||a===null||h+a<=0)return {home:null,away:null};return {home:h/(h+a)*100,away:a/(h+a)*100}}
function rolling(history,minutes){
  if(!Array.isArray(history)||history.length<2)return null;
  const cur=history[history.length-1],target=cur.at-Number(minutes||10)*60_000;let old=null;
  for(let i=history.length-2;i>=0;i--){if(history[i].at<=target){old=history[i];break}}
  if(!old)return null;
  return {fromAt:old.at,toAt:cur.at,fromMinute:old.minute,toMinute:cur.minute,shotsOnTarget:deltaPair(cur.shotsOnTarget,old.shotsOnTarget),shotsOffTarget:deltaPair(cur.shotsOffTarget,old.shotsOffTarget),corners:deltaPair(cur.corners,old.corners),attacks:deltaPair(cur.attacks,old.attacks),dangerousAttacks:deltaPair(cur.dangerousAttacks,old.dangerousAttacks),possession:cur.possession};
}
const PRESSURE_WEIGHTS={attacks:20,dangerousAttacks:30,shotsOnTarget:20,shotsOffTarget:10,corners:10,possession:10};
function pressurePoint(history,index,minutes=10){
  const cur=history[index];if(!cur)return null;const target=Number(cur.at||0)-Number(minutes||10)*60_000;let old=null;
  for(let i=index-1;i>=0;i--){if(Number(history[i]?.at||0)<=target){old=history[i];break}}
  if(!old&&index>0)old=history[0];const parts=[];
  const add=(key,p)=>{const s=sharePair(p);if(s.home===null||s.away===null)return;parts.push({weight:PRESSURE_WEIGHTS[key],home:s.home/100,away:s.away/100})};
  if(old){add('attacks',deltaPair(cur.attacks,old.attacks));add('dangerousAttacks',deltaPair(cur.dangerousAttacks,old.dangerousAttacks));add('shotsOnTarget',deltaPair(cur.shotsOnTarget,old.shotsOnTarget));add('shotsOffTarget',deltaPair(cur.shotsOffTarget,old.shotsOffTarget));add('corners',deltaPair(cur.corners,old.corners))}
  add('possession',cur.possession);const total=parts.reduce((s,x)=>s+x.weight,0);let home=50;if(total)home=parts.reduce((s,x)=>s+x.home*x.weight,0)/total*100;const away=100-home;
  return {at:num(cur.at),minute:num(cur.minute),home:Math.round(home*10)/10,away:Math.round(away*10)/10,windowMinutes:old?Math.max(1,Math.round((Number(cur.at||0)-Number(old.at||0))/60_000)):0};
}
function pressureSeries(history,minutes=10){return (Array.isArray(history)?history:[]).map((_,i)=>pressurePoint(history,i,minutes)).filter(Boolean)}
function sideValue(p,side){return num(side==='HOME'?p?.home:p?.away)}
function evidenceSide(roll,cfg,side,low=false){
  if(!roll)return {pass:false,count:0,required:Number(cfg.evidenceRequired||3),side,mode:low?'LOW':'HIGH',items:[],strength:0,reason:'WARMING'};
  const values=[
    ['shotOnTarget',sideValue(roll.shotsOnTarget,side),num(cfg.shotOnTarget)],
    ['shotOff',sideValue(roll.shotsOffTarget,side),num(cfg.shotOff)],
    ['corner',sideValue(roll.corners,side),num(cfg.corner)],
    ['attackPct',sideValue(sharePair(roll.attacks),side),num(cfg.attackPct)],
    ['dangerousAttackPct',sideValue(sharePair(roll.dangerousAttacks),side),num(cfg.dangerousAttackPct)],
    ['possessionPct',sideValue(roll.possession,side),num(cfg.possessionPct)]
  ];
  const items=values.map(([key,value,threshold])=>({key,value,threshold,pass:value!==null&&threshold!==null&&(low?value<=threshold:value>=threshold)}));
  const count=items.filter(x=>x.pass).length,required=Number(cfg.evidenceRequired||3);
  return {pass:count>=required,count,required,side,mode:low?'LOW':'HIGH',items,strength:count*100+items.filter(x=>x.pass).reduce((s,x)=>s+Math.abs((x.value-x.threshold)/Math.max(1,Math.abs(x.threshold))),0)};
}
function selectionsFor(key,cfg){
  const def=MARKET_RULES[key];if(def.selection)return [def.selection];
  if(def.kind==='AH'){const m=String(cfg.sideMode||'BOTH').toUpperCase();return m==='HOME'?['HOME']:m==='AWAY'?['AWAY']:['HOME','AWAY']}
  if(def.kind==='1X2'){const m=String(cfg.sideMode||'BOTH').toUpperCase();if(m==='HOME')return['HOME'];if(m==='AWAY')return['AWAY'];if(m==='DRAW')return['DRAW'];if(m==='ALL')return['HOME','DRAW','AWAY'];return['HOME','AWAY']}
  return [];
}
function evidenceForSelection(key,selection,roll,cfg){
  const def=MARKET_RULES[key],sel=String(selection).toUpperCase();
  if(def.kind==='1X2'||def.kind==='AH'){
    if(sel==='DRAW'){
      const h=evidenceSide(roll,cfg,'HOME',false),a=evidenceSide(roll,cfg,'AWAY',false);return {pass:h.pass&&a.pass,count:Math.min(h.count,a.count),required:h.required,side:'BOTH',mode:'BALANCED_HIGH',items:[...h.items,...a.items],strength:Math.min(h.strength,a.strength)};
    }
    return evidenceSide(roll,cfg,sel,false);
  }
  if(def.kind==='BTTS'){
    if(sel==='YES'){const h=evidenceSide(roll,cfg,'HOME',false),a=evidenceSide(roll,cfg,'AWAY',false);return {pass:h.pass&&a.pass,count:Math.min(h.count,a.count),required:h.required,side:'BOTH',mode:'BOTH_HIGH',items:[...h.items,...a.items],strength:Math.min(h.strength,a.strength)}}
    const h=evidenceSide(roll,cfg,'HOME',true),a=evidenceSide(roll,cfg,'AWAY',true);return h.strength>=a.strength?h:a;
  }
  if(sel==='UNDER'){const h=evidenceSide(roll,cfg,'HOME',true),a=evidenceSide(roll,cfg,'AWAY',true);return h.strength>=a.strength?h:a}
  const h=evidenceSide(roll,cfg,'HOME',false),a=evidenceSide(roll,cfg,'AWAY',false);return h.strength>=a.strength?h:a;
}
function scoreTrailingPass(f,selection,max){if(!['HOME','AWAY'].includes(selection))return true;const h=num(f.goals?.home),a=num(f.goals?.away);if(h===null||a===null)return false;const def=selection==='HOME'?a-h:h-a;return def<=Number(max??99)}
function preCandidatesForRule(key,f,history,cfg){
  const def=MARKET_RULES[key];if(!periodEligible(f,def,cfg))return {state:'TIME',candidates:[]};
  const roll=rolling(history,cfg.rollingWindowMinutes);if(!roll)return {state:'WARMING',candidates:[]};
  const rows=[];
  for(const selection of selectionsFor(key,cfg)){
    const ev=evidenceForSelection(key,selection,roll,cfg);if(!ev.pass)continue;
    if(def.kind==='1X2'&&!scoreTrailingPass(f,selection,cfg.scoreTrailingMax))continue;
    rows.push({market:key,selection,evidence:ev,rolling:roll,strength:ev.strength});
  }
  return {state:rows.length?'EVIDENCE_PASS':'EVIDENCE',candidates:rows};
}

function oddsRoot(payload){
  const books=payload?.data?.bookmakers??payload?.bookmakers;if(Array.isArray(books)){const b=books.find(x=>String(x?.slug??x?.name??'').toLowerCase().replace(/[\s_-]/g,'').includes('bet365'));if(b?.odds)return b.odds}
  return payload?.data?.odds??payload?.odds??payload?.data??null;
}
function findMarket(root,def){if(!root||typeof root!=='object')return null;for(const k of def.aliases||[]){if(root[k]!==undefined&&root[k]!==null)return root[k]}return null}
function stageValue(market,stage){if(!market||typeof market!=='object')return null;return market[stage]??(stage==='inplay'?market.in_play??market.live:null)??null}
function stageSnapshot(root,def,stage){const v=stageValue(findMarket(root,def),stage);return v&&typeof v==='object'?clone(v):v??null}
function priceFor(root,key,selection){
  const def=MARKET_RULES[key],stage=stageValue(findMarket(root,def),'inplay');if(!stage||typeof stage!=='object')return null;
  const sel=String(selection).toUpperCase();
  if(def.kind==='1X2'){const odds=num(stage[sel.toLowerCase()]);return odds===null?null:{line:null,providerLine:null,odds}}
  if(def.kind==='BTTS'){const odds=num(stage[sel.toLowerCase()]);return odds===null?null:{line:null,providerLine:null,odds}}
  const providerLine=num(stage.line);if(providerLine===null)return null;
  if(def.kind==='AH'){
    const odds=num(sel==='HOME'?stage.home:stage.away);if(odds===null)return null;
    return {line:sel==='HOME'?providerLine:-providerLine,providerLine,providerLineSide:'HOME',odds};
  }
  const odds=num(sel==='OVER'?stage.over:stage.under);return odds===null?null:{line:providerLine,providerLine,odds};
}
function pricePass(key,cfg,price,f){
  const def=MARKET_RULES[key];if(!price||price.odds<Number(cfg.oddsMin)||price.odds>Number(cfg.oddsMax))return false;
  if(def.kind==='AH'){if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;if(num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false}
  if(def.kind==='OU'){
    if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;
    if(def.selection==='UNDER'&&num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false;
    if(def.gap){const total=currentBasisTotal(f,def.basis);if(!gapPass(price.line,total,cfg.lineGapMax))return false}
  }
  return true;
}
async function fetchFullOdds(fixtureId,env){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=bet365`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok)throw new Error(`5USD_ODDS_HTTP_${r.status}`);const root=oddsRoot(j);if(!root)throw new Error('5USD_ODDS_SHAPE');return root;
}
function pickBestPriced(candidates,root,f,settings){
  const passed=[];for(const c of candidates){const price=priceFor(root,c.market,c.selection),cfg=settings[c.market];if(!pricePass(c.market,cfg,price,f))continue;passed.push({...c,price})}
  passed.sort((a,b)=>b.strength-a.strength||a.price.odds-b.price.odds);return passed[0]||null;
}
function storedFixture(s){return {goals:s?.finalScore??null,corners:s?.finalCorners??null,cards:s?.finalCards??null}}
function reconcileSettled(s){
  if(s?.status!=='SETTLED')return false;
  const result=settleMarketSignal(s,storedFixture(s));if(!result)return false;
  const changed=result!==s.result;
  if(changed){s.previousResult=s.result;s.result=result;s.reconciledAt=now()}
  s.settlementRevision=SETTLEMENT_REVISION;
  return changed;
}
function statsFrom(signals){
  const rows=signals.filter(s=>s.status==='SETTLED');const count=r=>rows.filter(x=>x.result===r).length;const win=count('WIN'),loss=count('LOSS'),push=count('PUSH'),halfWin=count('HALF_WIN'),halfLoss=count('HALF_LOSS'),denom=win+loss+halfWin+halfLoss;
  const byMarket=Object.fromEntries(MARKET_KEYS.map(k=>[k,rows.filter(x=>x.market===k).length]));const byProviderMarket={};for(const s of rows){const p=MARKET_RULES[s.market]?.provider||s.market;byProviderMarket[p]=(byProviderMarket[p]||0)+1}
  return {total:rows.length,win,loss,push,halfWin,halfLoss,unresolved:signals.filter(s=>s.status==='UNRESOLVED').length,winRate:denom?Math.round(((win+.5*halfWin)/denom)*1000)/10:null,byMarket,byProviderMarket,rows:rows.slice().sort((a,b)=>b.createdAt-a.createdAt)};
}

export class Nomad343Engine extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.scanPromise=null}
  async readSettings(){const raw=await this.ctx.storage.get('settings')||{};return sanitizeSettings(raw)}
  async readRun(){const raw=await this.ctx.storage.get('runState')||{};return sanitizeRun(raw)}
  async scanIfDue(){const last=await this.ctx.storage.get('lastScan');if(last?.finishedAt&&now()-last.finishedAt<MIN_SCAN_GAP_MS)return last;if(this.scanPromise)return this.scanPromise;this.scanPromise=this.scan().finally(()=>{this.scanPromise=null});return this.scanPromise}
  async scan(){
    const startedAt=now();
    try{
      const hr=await this.env.HUB.fetch('https://hub.internal/snapshot');const hub=await hr.json();if(!hub?.ok)throw new Error(hub?.error||'HUB_NOT_READY');
      const settings=await this.readSettings(),run=await this.readRun(),oldHist=await this.ctx.storage.get('histories')||{},signals=await this.ctx.storage.get('signals')||[],prevBoard=await this.ctx.storage.get('board')||{};
      const prevById=new Map((Array.isArray(prevBoard?.fixtures)?prevBoard.fixtures:[]).map(x=>[String(x?.fixtureId??''),x]));
      const pendingFixtureIds=new Set(signals.filter(s=>s.status==='PENDING').map(s=>String(s.fixtureId)));
      const histories={},board=[],seen=new Set(signals.filter(s=>s.status==='PENDING').map(s=>`${s.fixtureId}:${s.market}`));const at=Number(hub.fetchedAt||now());
      const fixtureMap=new Map();for(const f of hub.fixtures||[])fixtureMap.set(String(f.fixtureId),f);
      for(const f of hub.fixtures||[]){
        const id=String(f.fixtureId),arr=Array.isArray(oldHist[id])?oldHist[id].slice():[];
        if(isLive(f)){const snap=metricSnapshot(f,at);if(arr.length&&arr[arr.length-1].at===at)arr[arr.length-1]=snap;else arr.push(snap)}
        histories[id]=arr.filter(x=>at-x.at<=HISTORY_MS).slice(-MAX_HISTORY_ROWS);
      }
      const fixtureCandidates=[];
      for(const f of hub.fixtures||[]){
        const analysis={};if(isLive(f)){
          const id=String(f.fixtureId),marketCandidates=[];
          for(const key of MARKET_KEYS){
            if(!run[key]){analysis[key]={state:'STOP'};continue}
            if(seen.has(`${id}:${key}`)){analysis[key]={state:'LOCKED'};continue}
            const pre=preCandidatesForRule(key,f,histories[id]||[],settings[key]);analysis[key]={state:pre.state};if(pre.candidates.length)marketCandidates.push(...pre.candidates);
          }
          if(marketCandidates.length)fixtureCandidates.push({fixture:f,candidates:marketCandidates,maxStrength:Math.max(...marketCandidates.map(c=>c.strength))});
        }
        const prev=prevById.get(String(f.fixtureId)),prevAt=num(prev?.fullOddsFetchedAt),keepFullOdds=Boolean(prev?.fullOdds)&&(pendingFixtureIds.has(String(f.fixtureId))||(isLive(f)&&prevAt!==null&&at-prevAt<=15*60_000));
        board.push({...f,analysis,fullOdds:keepFullOdds?prev.fullOdds:null,fullOddsFetchedAt:keepFullOdds?prevAt:null,fullOddsSource:keepFullOdds?'ENGINE_REFEREE':null});
      }
      fixtureCandidates.sort((a,b)=>b.maxStrength-a.maxStrength);const selected=fixtureCandidates.slice(0,MAX_ODDS_FIXTURES_PER_SCAN),selectedIds=new Set(selected.map(x=>String(x.fixture.fixtureId)));let refereeRequests=0,refereeErrors=[];
      for(const item of fixtureCandidates){if(!selectedIds.has(String(item.fixture.fixtureId))){const b=board.find(x=>String(x.fixtureId)===String(item.fixture.fixtureId));if(b)for(const c of item.candidates)b.analysis[c.market]={state:'QUEUED_PRICE_REFEREE'};}}
      for(const item of selected){
        const f=item.fixture,id=String(f.fixtureId);let root=null;try{root=await fetchFullOdds(id,this.env);refereeRequests++}catch(e){refereeErrors.push({fixtureId:id,error:String(e?.message||e)});const b=board.find(x=>String(x.fixtureId)===id);if(b)for(const c of item.candidates)b.analysis[c.market]={state:'PRICE_REFEREE_ERROR'};continue}
        const fullOddsBoardRow=board.find(x=>String(x.fixtureId)===id);if(fullOddsBoardRow){fullOddsBoardRow.fullOdds=clone(root);fullOddsBoardRow.fullOddsFetchedAt=now();fullOddsBoardRow.fullOddsSource='ENGINE_REFEREE'}
        const grouped=new Map();for(const c of item.candidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}
        for(const [key,cands] of grouped){const best=pickBestPriced(cands,root,f,settings);const b=board.find(x=>String(x.fixtureId)===id);if(!best){if(b)b.analysis[key]={state:'NO_PRICE_PASS'};continue}
          const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:'Bet365',observedAt:now()};
          const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,line:price.line,selectionLine:price.line,providerLine:price.providerLine,providerLineSide:price.providerLineSide??null,odds:price.odds,bookmaker:'Bet365',priceStage:'inplay',priceSource:'fixture-odds',openingPrice:stageSnapshot(root,def,'opening'),closingPrice:stageSnapshot(root,def,'closing'),inplayPrice:stageSnapshot(root,def,'inplay'),createdAt:now(),entryMinute:num(f.minute),minute:num(f.minute),entryScore:clone(f.goals),scoreAt:clone(f.goals),entryCorners:clone(f.corners),entryCards:clone(f.cards),entryStats:clone(f.statistics),statisticsAtEntry:clone(f.statistics),eventHistory:Array.isArray(f.events)?clone(f.events):[],bookmakerHistory:[historyPoint],evidence:best.evidence,rolling:best.rolling,status:'PENDING',result:null,finalScore:null,finalCorners:null,finalCards:null,settlementBasis:def.basis||'goals',settlementRevision:SETTLEMENT_REVISION,lineGap:def.gap?lineGap(price.line,currentBasisTotal(f,def.basis)):null};
          signals.push(sig);seen.add(`${id}:${key}`);if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,evidence:best.evidence};
        }
      }
      let reconciled=0;
      for(const s of signals){
        if(s.status==='SETTLED'){if(reconcileSettled(s))reconciled++;continue}
        if(!['PENDING','UNRESOLVED'].includes(s.status))continue;
        const f=fixtureMap.get(String(s.fixtureId));if(!f)continue;
        if(isUnknown(f)){
          s.status='UNRESOLVED';s.settlementError=String(f?.statusReason||'RESULT_UNCONFIRMED').toUpperCase();s.settledAt=s.settledAt||now();s.settlementRevision=SETTLEMENT_REVISION;continue;
        }
        if(!periodCompleteForSignal(s,f))continue;
        const result=settleMarketSignal(s,f);
        if(!result){s.status='UNRESOLVED';s.settlementError='FINAL_DATA_UNAVAILABLE';s.settledAt=s.settledAt||now();s.settlementRevision=SETTLEMENT_REVISION;continue}
        s.status='SETTLED';s.result=result;s.finalScore=clone(f.goals);s.finalCorners=clone(f.corners);s.finalCards=clone(f.cards);s.settledAt=now();s.settlementError=null;s.settlementRevision=SETTLEMENT_REVISION;
      }
      await this.ctx.storage.put('histories',histories);await this.ctx.storage.put('signals',signals.slice(-MAX_SIGNALS));await this.ctx.storage.put('board',{ok:true,version:VERSION,hubVersion:hub.version,hubFetchedAt:hub.fetchedAt,hubAgeMs:hub.ageMs,stale:hub.stale,counts:hub.counts,fixtures:board,runState:run,referee:{maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors}});
      const meta={ok:true,startedAt,finishedAt:now(),fixtureCount:board.length,liveCount:board.filter(isLive).length,signalCount:signals.filter(s=>s.status==='PENDING').length,unresolvedCount:signals.filter(s=>s.status==='UNRESOLVED').length,reconciled,refereeRequests,refereeQueued:Math.max(0,fixtureCandidates.length-selected.length),lastError:null};await this.ctx.storage.put('lastScan',meta);return meta;
    }catch(e){const meta={ok:false,startedAt,finishedAt:now(),lastError:String(e?.message||e)};await this.ctx.storage.put('lastScan',meta);return meta}
  }
  async fetch(request){
    const u=new URL(request.url);if(!['/settings','/registry'].includes(u.pathname))await this.scanIfDue();
    if(u.pathname==='/health'){const m=await this.ctx.storage.get('lastScan');return Response.json({ok:Boolean(m?.ok),component:'NOMAD343_ENGINE',version:VERSION,...m})}
    if(u.pathname==='/registry')return Response.json({ok:true,version:VERSION,settlementRevision:SETTLEMENT_REVISION,markets:MARKET_RULES,marketKeys:MARKET_KEYS});
    if(u.pathname==='/settings'&&request.method==='GET')return Response.json({ok:true,version:VERSION,settings:await this.readSettings(),runState:await this.readRun(),markets:MARKET_RULES});
    if(u.pathname==='/settings'&&request.method==='PUT'){const body=await request.json().catch(()=>({}));const current=await this.readSettings(),settings=sanitizeSettings({...current,...(body.settings||{})}),run=sanitizeRun({...await this.readRun(),...(body.runState||{})});await this.ctx.storage.put('settings',settings);await this.ctx.storage.put('runState',run);return Response.json({ok:true,settings,runState:run,markets:MARKET_RULES})}
    if(u.pathname==='/scan'&&request.method==='POST')return Response.json(await this.scan());
    if(u.pathname==='/board')return Response.json(await this.ctx.storage.get('board')||{ok:false,version:VERSION,error:'NO_BOARD'});
    if(u.pathname==='/signals'){const s=await this.ctx.storage.get('signals')||[];return Response.json({ok:true,version:VERSION,signals:s.filter(x=>x.status==='PENDING').sort((a,b)=>b.createdAt-a.createdAt),allCount:s.length})}
    if(u.pathname==='/statistics'){const s=await this.ctx.storage.get('signals')||[];return Response.json({ok:true,version:VERSION,settlementRevision:SETTLEMENT_REVISION,markets:MARKET_RULES,...statsFrom(s)})}
    if(u.pathname==='/history'&&request.method==='GET'){const fixtureId=String(u.searchParams.get('fixtureId')||'').trim();if(!fixtureId)return Response.json({ok:false,error:'FIXTURE_ID_REQUIRED'},{status:400});const minutes=Math.max(2,Math.min(30,Math.round(num(u.searchParams.get('window'))??10))),histories=await this.ctx.storage.get('histories')||{},rows=Array.isArray(histories[fixtureId])?histories[fixtureId]:[];return Response.json({ok:true,version:'nomad343-flow-history-v1',fixtureId,retainedMinutes:180,maxRows:MAX_HISTORY_ROWS,pressureWindowMinutes:minutes,weights:PRESSURE_WEIGHTS,firstAt:rows[0]?.at??null,lastAt:rows[rows.length-1]?.at??null,rows,pressure:pressureSeries(rows,minutes)})}
    return new Response('Not found',{status:404});
  }
}
function stub(env){return env.ENGINE.get(env.ENGINE.idFromName('global'))}
function cors(request,response){const h=new Headers(response.headers);h.set('access-control-allow-origin',request.headers.get('origin')||'*');h.set('access-control-allow-methods','GET,PUT,POST,OPTIONS');h.set('access-control-allow-headers','content-type');h.set('cache-control','no-store');return new Response(response.body,{status:response.status,headers:h})}
export default{
  async fetch(request,env){if(request.method==='OPTIONS')return cors(request,new Response(null,{status:204}));const u=new URL(request.url);if(!['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history'].includes(u.pathname))return cors(request,new Response('Not found',{status:404}));return cors(request,await stub(env).fetch(new Request(`https://engine.internal${u.pathname}${u.search}`,request)))},
  async scheduled(_event,env,ctx){ctx.waitUntil(stub(env).fetch('https://engine.internal/scan',{method:'POST'}))}
};