import { DurableObject } from 'cloudflare:workers';

const VERSION = 'ball46-344-v1.0.0';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const LIVE_PAGE_SIZE = 500;
const TICK_MS = 20_000;
const MIN_TICK_GAP_MS = 12_000;
const ODDS_PER_TICK = 6;
const TIMELINE_MAX = 110;
const SIGNAL_MAX = 700;
const PREDICTION_MAX = 180;
const PROVIDER_BOOKS = [
  'bet365','pinnacle','williamhill','ladbrokes','vcbet','1xbet','bwin','easybets',
  'interwetten','betfair','snai','macauslot','betsson','betathome','18bet','10bet',
  '12bet','coral','crown'
];
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (body, status=200, extra={}) => new Response(JSON.stringify(body), {
  status,
  headers: {...CORS, 'content-type':'application/json; charset=utf-8', ...extra}
});
const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const num = (v) => finite(v) ? Number(v) : null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const now = () => Date.now();
const clone = (v) => JSON.parse(JSON.stringify(v));
const fixtureId = (f) => f?.id ?? f?.fixture_id ?? f?.fixture?.id ?? null;
const extractRows = (p) => Array.isArray(p?.data) ? p.data : Array.isArray(p?.data?.data) ? p.data.data : Array.isArray(p?.fixtures) ? p.fixtures : [];
const pair = (v) => ({home:num(v?.home), away:num(v?.away)});
const sumPair = (p) => (num(p?.home) ?? 0) + (num(p?.away) ?? 0);
const sideVal = (p, side) => num(side === 'HOME' ? p?.home : p?.away);
const scoreTotal = (f) => (num(f?.goals?.home) ?? 0) + (num(f?.goals?.away) ?? 0);
const normName = (s) => String(s ?? '').trim();

function minuteOf(f){
  for(const v of [f?.minute, f?.elapsed, f?.status?.minute, f?.status?.elapsed, f?.timer?.minute, f?.timer?.elapsed]){
    if(finite(v)) return Number(v);
  }
  const m = String(f?.status_code ?? f?.statusCode ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}
function teamNames(f){
  return {
    home: normName(f?.teams?.home?.name ?? f?.home_team?.name ?? f?.home?.name ?? f?.home_name),
    away: normName(f?.teams?.away?.name ?? f?.away_team?.name ?? f?.away?.name ?? f?.away_name)
  };
}
function teamIds(f){
  return {
    home: f?.teams?.home?.id ?? f?.home_team?.id ?? f?.home?.id ?? null,
    away: f?.teams?.away?.id ?? f?.away_team?.id ?? f?.away?.id ?? null
  };
}
function leagueInfo(f){
  return {id:f?.league?.id ?? f?.competition?.id ?? null, name:normName(f?.league?.name ?? f?.competition?.name ?? f?.league_name)};
}
function statsRoot(f){ return f?.statistics ?? f?.stats ?? f?.live_statistics ?? null; }
function normalizeInlineOdds(root){
  if(!root || typeof root !== 'object') return {};
  return root;
}
function normalizeFixture(f){
  const id = fixtureId(f); if(id === null) return null;
  const teams = teamNames(f), ids = teamIds(f), st = statsRoot(f);
  return {
    fixtureId:String(id),
    league:leagueInfo(f),
    kickoffAt:f?.kickoff_utc ?? null,
    kickoffTs:num(f?.kickoff_ts),
    status:normName(f?.status ?? 'in_play') || 'in_play',
    statusReason:f?.status_reason ?? null,
    statusCode:f?.status_code ?? null,
    minute:minuteOf(f),
    home:{id:ids.home, name:teams.home},
    away:{id:ids.away, name:teams.away},
    goals:pair(f?.goals ?? f?.score),
    corners:pair(f?.corners ?? st?.corners),
    cards:{
      home:{yellow:num(f?.cards?.home?.yellow), red:num(f?.cards?.home?.red)},
      away:{yellow:num(f?.cards?.away?.yellow), red:num(f?.cards?.away?.red)}
    },
    statistics: st ? {
      attacks:pair(st?.attacks),
      dangerousAttacks:pair(st?.dangerous_attacks ?? st?.dangerousAttacks),
      shotsOnTarget:pair(st?.shots_on_target ?? st?.shotsOnTarget),
      shotsOffTarget:pair(st?.shots_off_target ?? st?.shotsOffTarget),
      possession:pair(st?.possession)
    } : null,
    events:Array.isArray(f?.events) ? f.events.slice(-80) : [],
    inlineOdds:normalizeInlineOdds(f?.odds),
    providerObservedAt:now()
  };
}
function stageObj(market){
  if(!market) return null;
  if(typeof market?.inplay === 'object' && market.inplay !== null) return market.inplay;
  return null;
}
function lineOnly(market){
  if(finite(market?.inplay)) return Number(market.inplay);
  if(finite(market?.inplay?.line)) return Number(market.inplay.line);
  return null;
}
function inlinePrice(f, market, side){
  const root=f?.inlineOdds ?? {};
  if(market==='1X2'){
    const p=stageObj(root?.['1x2']);
    return {line:null, odds:num(side==='HOME'?p?.home:p?.away), draw:num(p?.draw), source:'bulk'};
  }
  if(market==='AH'){
    const p=stageObj(root?.asian_handicap ?? root?.asian);
    const raw=lineOnly(root?.asian_handicap ?? root?.asian);
    const line=raw===null?null:(side==='HOME'?raw:-raw);
    return {line, odds:num(side==='HOME'?p?.home:p?.away), source:'bulk'};
  }
  if(market==='OVER' || market==='UNDER'){
    const p=stageObj(root?.goal_line ?? root?.goalline);
    return {line:lineOnly(root?.goal_line ?? root?.goalline), odds:num(market==='OVER'?p?.over:p?.under), source:'bulk'};
  }
  return {line:null, odds:null, source:'bulk'};
}
function snap(f){
  return {
    at:now(), minute:f.minute, goals:f.goals, corners:f.corners, cards:f.cards,
    statistics:f.statistics, inlineOdds:f.inlineOdds,
    eventsCount:Array.isArray(f.events)?f.events.length:0
  };
}
function snapshotSignature(s){
  return JSON.stringify([s.minute,s.goals,s.corners,s.cards,s.statistics,s.eventsCount,
    lineOnly(s.inlineOdds?.asian_handicap),lineOnly(s.inlineOdds?.goal_line),stageObj(s.inlineOdds?.['1x2'])]);
}
function rolling(history, current, minutes=5){
  if(!Array.isArray(history) || history.length < 2 || !current?.statistics) return null;
  const currentMinute=num(current.minute); if(currentMinute===null) return null;
  const target=currentMinute-minutes;
  let base=null;
  for(const row of history){ if(num(row.minute)!==null && row.minute<=target) base=row; }
  if(!base){
    for(const row of history){ if(num(row.minute)!==null && row.minute<currentMinute){base=row;break;} }
  }
  if(!base?.statistics) return null;
  const d=(a,b)=>({
    home:num(a?.home)===null||num(b?.home)===null?null:Math.max(0,num(a.home)-num(b.home)),
    away:num(a?.away)===null||num(b?.away)===null?null:Math.max(0,num(a.away)-num(b.away))
  });
  return {
    fromMinute:base.minute,toMinute:currentMinute,
    shotsOnTarget:d(current.statistics.shotsOnTarget,base.statistics.shotsOnTarget),
    shotsOffTarget:d(current.statistics.shotsOffTarget,base.statistics.shotsOffTarget),
    attacks:d(current.statistics.attacks,base.statistics.attacks),
    dangerousAttacks:d(current.statistics.dangerousAttacks,base.statistics.dangerousAttacks),
    corners:d(current.corners,base.corners),
    possession:current.statistics.possession
  };
}
function share(p,side){
  const h=num(p?.home),a=num(p?.away); if(h===null||a===null||h+a<=0) return null;
  return (side==='HOME'?h:a)/(h+a)*100;
}
function pressureScore(roll, side){
  if(!roll) return null;
  const sot=sideVal(roll.shotsOnTarget,side), soff=sideVal(roll.shotsOffTarget,side), cor=sideVal(roll.corners,side);
  const att=share(roll.attacks,side), danger=share(roll.dangerousAttacks,side), poss=sideVal(roll.possession,side);
  let score=0, available=0;
  const add=(v,fn)=>{if(v!==null){score+=fn(v);available++;}};
  add(sot,v=>Math.min(26,v*10)); add(soff,v=>Math.min(14,v*5)); add(cor,v=>Math.min(12,v*6));
  add(att,v=>clamp((v-45)*0.8,0,14)); add(danger,v=>clamp((v-45)*1.0,0,18)); add(poss,v=>clamp((v-48)*0.5,0,8));
  if(available<3) return null;
  return {score:clamp(score,0,100),sot,soff,corners:cor,attackShare:att,dangerShare:danger,possession:poss,available};
}
function estimateProbability(score, price){
  const implied=price?.odds?1/price.odds:0.5;
  const model=clamp(0.50 + (score-50)*0.0045,0.48,0.78);
  const calibrated=clamp(model*0.72+implied*0.28,0.46,0.78);
  return {model:calibrated, market:implied, edge:calibrated-implied};
}
function evidenceItems(p){
  if(!p)return [];
  return [
    {key:'SOT',value:p.sot,pass:(p.sot??0)>=1},
    {key:'SOFF',value:p.soff,pass:(p.soff??0)>=1},
    {key:'CORNER',value:p.corners,pass:(p.corners??0)>=1},
    {key:'DANGER%',value:p.dangerShare,pass:(p.dangerShare??0)>=56},
    {key:'ATTACK%',value:p.attackShare,pass:(p.attackShare??0)>=55},
    {key:'POSSESSION',value:p.possession,pass:(p.possession??0)>=52}
  ];
}
function makeCandidate(f, history){
  const minute=num(f.minute); if(minute===null || minute<48 || minute>89 || !f.statistics) return [];
  const current=snap(f), roll=rolling(history,current,5); if(!roll)return [];
  const out=[];
  for(const side of ['HOME','AWAY']){
    const pressure=pressureScore(roll,side); if(!pressure)continue;
    const ev=evidenceItems(pressure), evidenceCount=ev.filter(x=>x.pass).length;
    const scoreH=num(f.goals.home)??0, scoreA=num(f.goals.away)??0;
    const trailing=side==='HOME'?scoreA-scoreH:scoreH-scoreA;
    const ah=inlinePrice(f,'AH',side), one=inlinePrice(f,'1X2',side);
    const ahP=estimateProbability(pressure.score,ah);
    if(pressure.score>=62 && evidenceCount>=3 && trailing<=1 && ah.line!==null && ah.odds!==null && ah.odds>=1.60 && ahP.edge>=0.035){
      out.push({market:'AH',side,pressure,evidence:ev,evidenceCount,price:ah,probability:ahP,reason:'PRESSURE + PRICE EDGE'});
    }
    const oneP=estimateProbability(pressure.score,one);
    if(pressure.score>=72 && evidenceCount>=4 && trailing<=0 && one.odds!==null && one.odds>=1.65 && oneP.edge>=0.04){
      out.push({market:'1X2',side,pressure,evidence:ev,evidenceCount,price:one,probability:oneP,reason:'DOMINANT LIVE PRESSURE'});
    }
  }
  const totalPressure=(pressureScore(roll,'HOME')?.score??0)+(pressureScore(roll,'AWAY')?.score??0);
  const totalSot=sumPair(roll.shotsOnTarget), totalSoff=sumPair(roll.shotsOffTarget), totalCor=sumPair(roll.corners);
  const over=inlinePrice(f,'OVER','HOME'), under=inlinePrice(f,'UNDER','HOME');
  const gap=over.line===null?null:over.line-scoreTotal(f);
  const overScore=clamp(totalPressure/2 + totalSot*7 + totalSoff*3 + totalCor*4,0,100);
  const overP=estimateProbability(overScore,over);
  if(minute>=52 && minute<=84 && totalSot>=2 && (totalSoff>=2||totalCor>=1) && over.line!==null && gap!==null && gap<=1.5 && over.odds!==null && over.odds>=1.65 && overP.edge>=0.035){
    out.push({market:'OVER',side:'BOTH',pressure:{score:overScore,totalSot,totalSoff,totalCor},evidence:[],evidenceCount:3,price:over,probability:overP,reason:'SUSTAINED TOTAL PRESSURE'});
  }
  const underScore=clamp(78 - totalSot*15 - totalSoff*7 - totalCor*8,35,78);
  const underP=estimateProbability(underScore,under);
  const underGap=under.line===null?null:under.line-scoreTotal(f);
  if(minute>=58 && minute<=82 && totalSot<=1 && totalSoff<=2 && totalCor<=1 && under.line!==null && underGap!==null && underGap>=1 && under.odds!==null && under.odds>=1.65 && underP.edge>=0.03){
    out.push({market:'UNDER',side:'BOTH',pressure:{score:underScore,totalSot,totalSoff,totalCor},evidence:[],evidenceCount:3,price:under,probability:underP,reason:'LOW TEMPO + PRICE EDGE'});
  }
  return out;
}
function signalKey(c,f){return `${f.fixtureId}:${c.market}:${c.side}`;}
function publicSignal(c,f){
  return {
    id:`${f.fixtureId}-${c.market}-${c.side}-${now()}`,
    key:signalKey(c,f),fixtureId:f.fixtureId,createdAt:now(),market:c.market,side:c.side,
    league:f.league,home:f.home,away:f.away,minute:f.minute,score:clone(f.goals),
    line:c.price?.line??null,odds:c.price?.odds??null,bookmaker:'Bet365',
    confidence:Math.round((c.probability?.model??0.5)*100),
    marketProbability:Number(((c.probability?.market??0)*100).toFixed(1)),
    modelProbability:Number(((c.probability?.model??0)*100).toFixed(1)),
    edge:Number(((c.probability?.edge??0)*100).toFixed(1)),
    reason:c.reason,pressure:c.pressure,evidence:c.evidence,result:'PENDING',finalScore:null,settledAt:null
  };
}
function splitAsianLine(line){
  const x=Number(line); const q=Math.round(x*4)/4;
  const frac=Math.abs(q*4)%2;
  if(frac!==1) return [q,q];
  return [q-0.25,q+0.25];
}
function settlePart(diff,line){const v=diff+line;return v>0?'WIN':v<0?'LOSS':'PUSH';}
function combineParts(a,b){
  if(a===b)return a;
  if((a==='WIN'&&b==='PUSH')||(b==='WIN'&&a==='PUSH'))return 'HALF_WIN';
  if((a==='LOSS'&&b==='PUSH')||(b==='LOSS'&&a==='PUSH'))return 'HALF_LOSS';
  if((a==='WIN'&&b==='LOSS')||(a==='LOSS'&&b==='WIN'))return 'PUSH';
  return 'PUSH';
}
function settleSignal(sig,fixture){
  const h=num(fixture?.goals?.home),a=num(fixture?.goals?.away);if(h===null||a===null)return null;
  if(sig.market==='1X2'){
    const win=sig.side==='HOME'?h>a:a>h;const loss=sig.side==='HOME'?h<a:a<h;
    return win?'WIN':loss?'LOSS':'PUSH';
  }
  if(sig.market==='OVER'||sig.market==='UNDER'){
    const total=h+a, parts=splitAsianLine(sig.line);
    const evalPart=(line)=> sig.market==='OVER' ? settlePart(total,-line) : settlePart(line,-total);
    return combineParts(evalPart(parts[0]),evalPart(parts[1]));
  }
  if(sig.market==='AH'){
    const diff=sig.side==='HOME'?h-a:a-h;const parts=splitAsianLine(sig.line);
    return combineParts(settlePart(diff,parts[0]),settlePart(diff,parts[1]));
  }
  return null;
}
function resultUnits(result, odds){
  const o=num(odds)??1;
  if(result==='WIN')return o-1;if(result==='LOSS')return -1;if(result==='PUSH')return 0;
  if(result==='HALF_WIN')return (o-1)/2;if(result==='HALF_LOSS')return -0.5;return 0;
}
function summarizeSignals(signals){
  const resolved=signals.filter(s=>s.result&&s.result!=='PENDING');
  const wins=resolved.filter(s=>['WIN','HALF_WIN'].includes(s.result)).length;
  const losses=resolved.filter(s=>['LOSS','HALF_LOSS'].includes(s.result)).length;
  const pushes=resolved.filter(s=>s.result==='PUSH').length;
  const units=resolved.reduce((a,s)=>a+resultUnits(s.result,s.odds),0);
  const decided=wins+losses;
  const byMarket={};
  for(const s of resolved){const x=byMarket[s.market]??={count:0,wins:0,losses:0,pushes:0,units:0};x.count++;if(['WIN','HALF_WIN'].includes(s.result))x.wins++;else if(['LOSS','HALF_LOSS'].includes(s.result))x.losses++;else x.pushes++;x.units+=resultUnits(s.result,s.odds);byMarket[s.market]=x;}
  for(const x of Object.values(byMarket)){x.hitRate=(x.wins+x.losses)?Number((x.wins/(x.wins+x.losses)*100).toFixed(1)):null;x.units=Number(x.units.toFixed(2));}
  return {total:signals.length,resolved:resolved.length,pending:signals.length-resolved.length,wins,losses,pushes,hitRate:decided?Number((wins/decided*100).toFixed(1)):null,units:Number(units.toFixed(2)),roi:resolved.length?Number((units/resolved.length*100).toFixed(1)):null,byMarket};
}
function normalizeBookmakers(payload){
  const books=payload?.data?.bookmakers ?? payload?.bookmakers ?? [];
  if(!Array.isArray(books))return [];
  return books.map(b=>({name:b?.name??b?.slug??'',slug:b?.slug??'',odds:b?.odds??{}}));
}
function bookmakerSummary(books){
  const keep=['bet365','pinnacle','1xbet','williamhill','bwin','crown'];
  const rows=[];
  for(const b of books){if(!keep.includes(String(b.slug)))continue;const ah=b.odds?.asian_handicap?.inplay??null,ou=b.odds?.goal_line?.inplay??null,x=b.odds?.['1x2']?.inplay??null;rows.push({name:b.name,slug:b.slug,ah,ou,x});}
  return rows;
}
function predictionCandidate(f){
  const root=f?.odds??{}; const x=root?.['1x2']; if(!x)return null;
  const open=x?.opening, close=x?.closing??x?.opening;if(!close)return null;
  const prices={HOME:num(close.home),DRAW:num(close.draw),AWAY:num(close.away)};
  if(!prices.HOME||!prices.AWAY||!prices.DRAW)return null;
  const inv={HOME:1/prices.HOME,DRAW:1/prices.DRAW,AWAY:1/prices.AWAY};const z=inv.HOME+inv.DRAW+inv.AWAY;
  const fair={HOME:inv.HOME/z,DRAW:inv.DRAW/z,AWAY:inv.AWAY/z};
  const side=fair.HOME>=fair.AWAY?'HOME':'AWAY', odds=prices[side];
  if(odds<1.80||odds>2.25||fair[side]<0.44)return null;
  const openOdds=num(side==='HOME'?open?.home:open?.away)??odds;const shortening=clamp((openOdds-odds)/Math.max(openOdds,1),-0.2,0.2);
  const ahLine=lineOnly(root?.asian_handicap);const ahSupport=side==='HOME'?(ahLine!==null&&ahLine<=-0.25):(ahLine!==null&&ahLine>=0.25);
  if(shortening<0.02 || !ahSupport)return null;
  const model=clamp(fair[side]+Math.min(0.045,shortening*0.6)+0.025,0.45,0.72);const edge=model-fair[side];
  if(edge<0.03)return null;
  return {
    fixtureId:String(f.id),createdAt:now(),kickoffAt:f.kickoff_utc??null,league:leagueInfo(f),home:{id:f?.teams?.home?.id??null,name:f?.teams?.home?.name??''},away:{id:f?.teams?.away?.id??null,name:f?.teams?.away?.name??''},
    market:'1X2',side,odds,line:null,confidence:Math.round(model*100),modelProbability:Number((model*100).toFixed(1)),marketProbability:Number((fair[side]*100).toFixed(1)),edge:Number((edge*100).toFixed(1)),
    reason:'MARKET SUPPORT + PRICE SHORTENING + AH CONFIRMATION',result:'PENDING',finalScore:null,settledAt:null
  };
}

export class Ball46State extends DurableObject {
  constructor(ctx,env){
    super(ctx,env); this.ctx=ctx; this.env=env;
    this.ctx.blockConcurrencyWhile(async()=>{const a=await this.ctx.storage.getAlarm();if(a===null)await this.ctx.storage.setAlarm(now()+2500);});
  }
  async getCore(){
    const m=await this.ctx.storage.get(['live','signals','predictions','lastTickAt','lastSuccessAt','lastError','rate','oddsCursor','lastPredictionAt','settleQueue']);
    return {
      live:m.get('live')??{fixtures:[],candidates:[],observedAt:null,requestCount:0},signals:m.get('signals')??[],predictions:m.get('predictions')??[],
      lastTickAt:m.get('lastTickAt')??null,lastSuccessAt:m.get('lastSuccessAt')??null,lastError:m.get('lastError')??null,rate:m.get('rate')??{},
      oddsCursor:m.get('oddsCursor')??0,lastPredictionAt:m.get('lastPredictionAt')??0,settleQueue:m.get('settleQueue')??[]
    };
  }
  async provider(path){
    if(!this.env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
    const res=await fetch(`${API_BASE}${path}`,{headers:{accept:'application/json',authorization:`Bearer ${this.env.FIVEDOLLAR_API_KEY}`},cf:{cacheTtl:0,cacheEverything:false}});
    const text=await res.text();let body=null;try{body=JSON.parse(text)}catch{}
    const retryAfter=num(res.headers.get('Retry-After'));
    const rate={limit:num(res.headers.get('X-RateLimit-Limit')),remaining:num(res.headers.get('X-RateLimit-Remaining')),reset:res.headers.get('X-RateLimit-Reset')??null,retryAfter};
    await this.ctx.storage.put('rate',rate);
    if(res.status===429){const e=new Error('RATE_LIMIT');e.retryAfter=retryAfter??60;throw e;}
    if(!res.ok)throw new Error(`PROVIDER_HTTP_${res.status}`);
    return {body,rate};
  }
  async recordTimeline(f){
    const key=`timeline:${f.fixtureId}`, rows=(await this.ctx.storage.get(key))??[], s=snap(f), sig=snapshotSignature(s), prev=rows[rows.length-1];
    if(!prev || prev.signature!==sig){rows.push({...s,signature:sig});if(rows.length>TIMELINE_MAX)rows.splice(0,rows.length-TIMELINE_MAX);await this.ctx.storage.put(key,rows);}
  }
  async fullOddsFor(id){return (await this.ctx.storage.get(`odds:${id}`))??null;}
  async refreshFullOdds(fixtures,cursor){
    if(!fixtures.length)return {cursor:0,requests:0};
    const sorted=fixtures.map((f,i)=>({f,i}));
    let requests=0, next=cursor%fixtures.length;
    for(let k=0;k<Math.min(ODDS_PER_TICK,fixtures.length);k++){
      const idx=(next+k)%fixtures.length,id=fixtures[idx].fixtureId;
      try{
        const r=await this.provider(`/fixtures/${encodeURIComponent(id)}/odds?bookmakers=${PROVIDER_BOOKS.join(',')}`);requests++;
        const books=normalizeBookmakers(r.body);
        await this.ctx.storage.put(`odds:${id}`,{fixtureId:id,updatedAt:now(),bookmakers:books,summary:bookmakerSummary(books)});
      }catch(e){if(e.message==='RATE_LIMIT')throw e;}
    }
    return {cursor:(next+Math.min(ODDS_PER_TICK,fixtures.length))%fixtures.length,requests};
  }
  async settleOne(signals,predictions,queue){
    const pendingIds=[...new Set([...signals.filter(s=>s.result==='PENDING').map(s=>s.fixtureId),...predictions.filter(s=>s.result==='PENDING').map(s=>s.fixtureId)])];
    const liveIds=new Set((await this.ctx.storage.get('live'))?.fixtures?.map(f=>f.fixtureId)??[]);
    const candidates=pendingIds.filter(id=>!liveIds.has(id));
    const id=candidates[0]; if(!id)return {signals,predictions,requests:0};
    try{
      const r=await this.provider(`/fixtures/${encodeURIComponent(id)}`);const f=r.body?.data??r.body?.fixture??null;
      if(f?.status!=='finished')return {signals,predictions,requests:1};
      const goals=pair(f.goals??f.score),t=now();
      signals=signals.map(s=>{if(s.fixtureId!==id||s.result!=='PENDING')return s;const result=settleSignal(s,{goals});return result?{...s,result,finalScore:goals,settledAt:t}:s;});
      predictions=predictions.map(p=>{if(p.fixtureId!==id||p.result!=='PENDING')return p;const h=num(goals.home),a=num(goals.away);if(h===null||a===null)return p;const result=p.side==='HOME'?(h>a?'WIN':h<a?'LOSS':'PUSH'):(a>h?'WIN':a<h?'LOSS':'PUSH');return {...p,result,finalScore:goals,settledAt:t};});
      return {signals,predictions,requests:1};
    }catch(e){if(e.message==='RATE_LIMIT')throw e;return {signals,predictions,requests:0};}
  }
  async refreshPredictions(predictions){
    const start=Math.floor(now()/1000),end=start+24*3600;
    const r=await this.provider(`/fixtures?start_time=${start}&end_time=${end}&status=scheduled&include=odds&per_page=50&page=1`);
    const rows=extractRows(r.body), existing=new Set(predictions.map(p=>p.fixtureId)), choices=[];
    for(const f of rows){if(existing.has(String(f.id)))continue;const c=predictionCandidate(f);if(c)choices.push(c);}
    choices.sort((a,b)=>b.edge-a.edge||b.confidence-a.confidence);
    if(choices[0])predictions.push(choices[0]);
    if(predictions.length>PREDICTION_MAX)predictions.splice(0,predictions.length-PREDICTION_MAX);
    return {predictions,requests:1};
  }
  async tick(force=false){
    const core=await this.getCore(),t=now();
    if(!force && core.lastTickAt && t-core.lastTickAt<MIN_TICK_GAP_MS)return {ok:true,skipped:'MIN_GAP'};
    await this.ctx.storage.put('lastTickAt',t);
    if(core.rate?.retryAfter && core.lastError?.type==='RATE_LIMIT' && core.lastError?.retryUntil>t)return {ok:true,skipped:'RATE_BACKOFF'};
    let requests=0;
    try{
      const liveRes=await this.provider(`/fixtures?status=live&include=odds,events,stats&per_page=${LIVE_PAGE_SIZE}&page=1`);requests++;
      const fixtures=extractRows(liveRes.body).map(normalizeFixture).filter(Boolean);
      const candidates=[];let signals=core.signals;
      for(const f of fixtures){
        const key=`timeline:${f.fixtureId}`,hist=(await this.ctx.storage.get(key))??[];
        const cs=makeCandidate(f,hist);
        for(const c of cs){
          candidates.push({fixtureId:f.fixtureId,league:f.league,home:f.home,away:f.away,minute:f.minute,score:f.goals,...c});
          const keySig=signalKey(c,f);if(!signals.some(s=>s.key===keySig)){signals.push(publicSignal(c,f));}
        }
        await this.recordTimeline(f);
      }
      if(signals.length>SIGNAL_MAX)signals.splice(0,signals.length-SIGNAL_MAX);
      const liveIds=new Set(fixtures.map(f=>f.fixtureId));
      // Prune odds for finished/no-longer-live matches only after they have no pending signal.
      let oddsRefresh={cursor:core.oddsCursor,requests:0};
      try{oddsRefresh=await this.refreshFullOdds(fixtures,core.oddsCursor);requests+=oddsRefresh.requests;}catch(e){if(e.message==='RATE_LIMIT')throw e;}
      const publicFixtures=[];
      for(const f of fixtures){const full=await this.fullOddsFor(f.fixtureId);publicFixtures.push({...f,fullOddsSummary:full?.summary??[],fullOddsUpdatedAt:full?.updatedAt??null});}
      let predictions=core.predictions;
      try{const st=await this.settleOne(signals,predictions,core.settleQueue);signals=st.signals;predictions=st.predictions;requests+=st.requests;}catch(e){if(e.message==='RATE_LIMIT')throw e;}
      let lastPredictionAt=core.lastPredictionAt;
      if(t-lastPredictionAt>30*60*1000){try{const p=await this.refreshPredictions(predictions);predictions=p.predictions;requests+=p.requests;lastPredictionAt=t;}catch(e){if(e.message==='RATE_LIMIT')throw e;}}
      const live={ok:true,version:VERSION,observedAt:t,fixtures:publicFixtures,candidates:candidates.slice(0,120),requestCount:requests,provider:{name:'5DollarFootballAPI',liveCount:fixtures.length,rate:liveRes.rate}};
      await this.ctx.storage.put({live,signals,predictions,lastSuccessAt:t,lastError:null,oddsCursor:oddsRefresh.cursor,lastPredictionAt});
      return live;
    }catch(e){
      const retry=e.message==='RATE_LIMIT'?(num(e.retryAfter)??60):null;const err={type:e.message==='RATE_LIMIT'?'RATE_LIMIT':'PROVIDER_ERROR',message:e.message,at:t,retryUntil:retry?t+retry*1000:null};
      await this.ctx.storage.put('lastError',err);return {ok:false,error:err,requestCount:requests};
    }finally{await this.ctx.storage.setAlarm(now()+TICK_MS);}
  }
  async alarm(){try{await this.tick(false);}catch{}finally{await this.ctx.storage.setAlarm(now()+TICK_MS);}}
  async fetch(request){
    const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    if(url.pathname==='/internal/tick'){if(request.headers.get('x-ball46-internal')!==this.env.FIVEDOLLAR_API_KEY)return json({ok:false,error:'forbidden'},403);return json(await this.tick(url.searchParams.get('force')==='1'));}
    const core=await this.getCore();
    if(url.pathname==='/health'){
      const age=core.lastSuccessAt?Math.round((now()-core.lastSuccessAt)/1000):null;
      return json({ok:true,version:VERSION,status:age!==null&&age<60?'ONLINE':age!==null?'STALE':'STARTING',lastTickAt:core.lastTickAt,lastSuccessAt:core.lastSuccessAt,lastSuccessAgeSeconds:age,lastError:core.lastError,rate:core.rate,liveCount:core.live?.fixtures?.length??0,viewerUpstreamRequests:0,cadenceSeconds:TICK_MS/1000});
    }
    if(url.pathname==='/api/live')return json({...core.live,version:VERSION,viewerUpstreamRequests:0},200,{'cache-control':'public, max-age=2'});
    if(url.pathname==='/api/signals')return json({ok:true,signals:core.signals.slice().reverse().slice(0,250),summary:summarizeSignals(core.signals)});
    if(url.pathname==='/api/statistics')return json({ok:true,summary:summarizeSignals(core.signals),signals:core.signals.slice().reverse().slice(0,350)});
    if(url.pathname==='/api/predictions')return json({ok:true,predictions:core.predictions.slice().reverse().slice(0,80)});
    if(url.pathname==='/api/match'){
      const id=url.searchParams.get('id');if(!id)return json({ok:false,error:'id_required'},400);
      const match=core.live?.fixtures?.find(f=>f.fixtureId===id)??null;const odds=await this.fullOddsFor(id);const timeline=(await this.ctx.storage.get(`timeline:${id}`))??[];const signals=core.signals.filter(s=>s.fixtureId===id);
      return json({ok:true,match,odds,timeline:timeline.map(({signature,...x})=>x),signals,viewerUpstreamRequests:0});
    }
    return json({ok:true,name:'Ball46 3.44 Engine',version:VERSION,endpoints:['/health','/api/live','/api/match?id=','/api/signals','/api/statistics','/api/predictions']});
  }
}

export default {
  async fetch(request,env){const id=env.STATE.idFromName('ball46-global');return env.STATE.get(id).fetch(request);},
  async scheduled(_event,env,ctx){const id=env.STATE.idFromName('ball46-global');const stub=env.STATE.get(id);ctx.waitUntil(stub.fetch(new Request('https://internal/internal/tick',{headers:{'x-ball46-internal':env.FIVEDOLLAR_API_KEY||''}})).catch(()=>null));}
};
