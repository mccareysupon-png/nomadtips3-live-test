const VERSION='signal-engine-v1';
const FEED_URL='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
const MARKET_URL='https://nomadtips3-market-engine.mccarey-supon.workers.dev/candidate';
const LEDGER_URL='https://nomadtips3-342-ledger.mccarey-supon.workers.dev';
const SETTINGS_VERSION='market-settings-v3';
const MAX_MATCHES_PER_SCAN=4;
const MARKET_TIMEOUT_MS=7000;
const REMOTE_TIMEOUT_MS=10000;
const NOWGOAL_BASE='https://www.nowgoal.net';
const NOWGOAL_AH_COMPANY_ID='8';
const NOWGOAL_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';
const ALLOWED_ORIGINS=new Set([
  'https://www.nomadtips3.com','https://nomadtips3.com',
  'https://mccareysupon-png.github.io','http://localhost:8787','http://127.0.0.1:8787'
]);
const DEFAULTS=Object.freeze({
  over:{lineMin:0.5,lineMax:10,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
  under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
  oneXtwo:{sideMode:'BOTH',scoreTrailingMax:0,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5},
  ah:{sideMode:'BOTH',lineMin:-10,oddsMin:1.01,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:50,attackPct:50,possessionPct:50,evidenceRequired:3,minuteFrom:0,minuteTo:120,rollingWindowMinutes:5}
});
const MARKETS=['over','under','oneXtwo','ah'];
const EVIDENCE_KEYS=['shotOnTarget','shotOff','corner','dangerousAttackPct','attackPct','possessionPct'];

const finite=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null};
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const at=(pair,index)=>Array.isArray(pair)?finite(pair[index]):null;
const delta=(first,last,key,index)=>{const a=at(first?.[key],index),b=at(last?.[key],index);return a===null||b===null?null:b-a};
const share=(a,b)=>{a=finite(a);b=finite(b);if(a===null||b===null)return [null,null];a=Math.max(0,a);b=Math.max(0,b);const total=a+b;if(total<=0)return [null,null];const h=Number((a/total*100).toFixed(1));return [h,Number((100-h).toFixed(1))]};
const iso=v=>Number.isFinite(Number(v))?new Date(Number(v)).toISOString():null;

function normalizeMarket(name,input={}){
  const base=clone(DEFAULTS[name]),out={...base,...(input||{})};
  if(name!=='over')out.sideMode=['HOME','AWAY','BOTH'].includes(String(out.sideMode||'').toUpperCase())?String(out.sideMode).toUpperCase():'BOTH';
  for(const key of Object.keys(base)){if(key==='sideMode')continue;const n=finite(out[key]);out[key]=n===null?base[key]:n}
  return out;
}
function normalizeSettings(input={}){return {version:SETTINGS_VERSION,over:normalizeMarket('over',input.over),under:normalizeMarket('under',input.under),oneXtwo:normalizeMarket('oneXtwo',input.oneXtwo),ah:normalizeMarket('ah',input.ah)}}
function normalizeRun(input={}){return {over:Boolean(input.over),under:Boolean(input.under),oneXtwo:Boolean(input.oneXtwo),ah:Boolean(input.ah),updatedAt:finite(input.updatedAt)??Date.now()}}
function normalizeSnapshot(input={}){return {version:SETTINGS_VERSION,settings:normalizeSettings(input.settings||{}),run:normalizeRun(input.run||{}),updatedAt:finite(input.updatedAt)??Date.now()}}
function emptySnapshot(){return normalizeSnapshot({settings:DEFAULTS,run:{over:false,under:false,oneXtwo:false,ah:false}})}
function anyRunning(snapshot){return MARKETS.some(k=>Boolean(snapshot?.run?.[k]))}
function validateSnapshot(snapshot){
  const errors=[];
  for(const name of MARKETS){
    const c=snapshot.settings[name];
    if(c.minuteFrom<0||c.minuteTo>120||c.minuteFrom>c.minuteTo)errors.push(`${name}.minute`);
    if(c.rollingWindowMinutes<2||c.rollingWindowMinutes>30||!Number.isInteger(c.rollingWindowMinutes))errors.push(`${name}.rollingWindowMinutes`);
    if(c.oddsMin<1.01||c.oddsMin>20)errors.push(`${name}.oddsMin`);
    if(name==='ah'&&(c.lineMin<-10||c.lineMin>10||!Number.isInteger(c.lineMin*4)))errors.push(`${name}.lineMin`);
    if(name!=='oneXtwo'&&name!=='ah'&&(c.lineMin<.5||c.lineMin>10||!Number.isInteger(c.lineMin*2)))errors.push(`${name}.lineMin`);
    if(name==='over'&&(c.lineMax<.5||c.lineMax>10||!Number.isInteger(c.lineMax*2)||c.lineMin>c.lineMax))errors.push(`${name}.lineMax`);
    if(name==='oneXtwo'&&(c.scoreTrailingMax<0||c.scoreTrailingMax>10||!Number.isInteger(c.scoreTrailingMax)))errors.push(`${name}.scoreTrailingMax`);
    if(name!=='over'&&!['HOME','AWAY','BOTH'].includes(c.sideMode))errors.push(`${name}.sideMode`);
    if(c.evidenceRequired<1||c.evidenceRequired>6||!Number.isInteger(c.evidenceRequired))errors.push(`${name}.evidenceRequired`);
  }
  return errors;
}
function cors(request){
  const origin=request.headers.get('origin')||'';
  const headers=new Headers({
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'
  });
  headers.set('access-control-allow-origin',ALLOWED_ORIGINS.has(origin)?origin:'https://www.nomadtips3.com');
  return headers;
}
function json(request,body,status=200){return new Response(status===204?null:JSON.stringify(body),{status,headers:cors(request)})}
async function fetchJson(url,options={},timeoutMs=REMOTE_TIMEOUT_MS){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,cache:'no-store',signal:ac.signal});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw new Error(data?.error||`HTTP_${response.status}`);
    return data;
  }catch(error){if(error?.name==='AbortError')throw new Error('REMOTE_TIMEOUT');throw error}
  finally{clearTimeout(timer)}
}
function cookieFromHeaders(headers){
  const all=typeof headers?.getSetCookie==='function'?headers.getSetCookie():[];
  if(all.length)return all.map(value=>String(value).split(';')[0]).filter(Boolean).join('; ');
  const one=headers?.get?.('set-cookie')||'';return one?String(one).split(';')[0]:'';
}
async function fetchText(url,headers={},timeoutMs=MARKET_TIMEOUT_MS){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',redirect:'follow',headers,signal:ac.signal});
    const text=await response.text();
    if(!response.ok)throw new Error(`NOWGOAL_HTTP_${response.status}`);
    if(/cf-chl-|captcha|attention required|access denied/i.test(text))throw new Error('NOWGOAL_BLOCKED');
    return {text,headers:response.headers};
  }catch(error){if(error?.name==='AbortError')throw new Error('NOWGOAL_TIMEOUT');throw error}
  finally{clearTimeout(timer)}
}
function hkToDecimal(value){const n=finite(value);if(n===null||n<0)return null;const out=1+n;return out>1&&out<100?Number(out.toFixed(4)):null}
function parseAsianHandicapQuotes(xml='',observedAt=Date.now()){
  const out=new Map();
  for(const match of String(xml).matchAll(/<m>([^<]+)<\/m>/g)){
    const fields=match[1].split(',').map(value=>String(value??'').trim()),id=String(fields[0]||'');
    const rawHomeLine=finite(fields[2]),rawHomeHk=finite(fields[3]),rawAwayHk=finite(fields[4]),homeOdds=hkToDecimal(rawHomeHk),awayOdds=hkToDecimal(rawAwayHk);
    if(!/^\d+$/.test(id)||rawHomeLine===null||rawHomeHk===null||rawAwayHk===null||homeOdds===null||awayOdds===null||!Number.isInteger(rawHomeLine*4))continue;
    out.set(id,{rawHomeLine,rawHomeHk,rawAwayHk,homeOdds,awayOdds,observedAt,provider:'Nowgoal',bookmaker:'Bet365',companyId:NOWGOAL_AH_COMPANY_ID,linePerspective:'HOME'});
  }
  return out;
}
async function fetchAsianHandicapQuotes(now=Date.now()){
  const common={'user-agent':NOWGOAL_UA,accept:'text/html,*/*','accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store',pragma:'no-cache',referer:`${NOWGOAL_BASE}/`};
  const home=await fetchText(`${NOWGOAL_BASE}/`,common);
  const cookie=cookieFromHeaders(home.headers);if(!cookie)throw new Error('NOWGOAL_SESSION_COOKIE_MISSING');
  const xml=await fetchText(`${NOWGOAL_BASE}/gf/data/odds/en/goal${NOWGOAL_AH_COMPANY_ID}.xml?${now}`,{...common,accept:'application/xml,text/xml,*/*',cookie});
  return parseAsianHandicapQuotes(xml.text,now);
}

function rollingFootball(m,minutes){
  const current=finite(m?.minute),windowMinutes=Number(minutes),snaps=[...(m?.event?.snapshots||[])]
    .filter(s=>finite(s?.minute)!==null).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
  if(current===null||!Number.isFinite(windowMinutes))return null;
  const eligible=snaps.filter(s=>Number(s.minute)>=current-windowMinutes&&Number(s.minute)<=current),first=eligible[0],last=eligible[eligible.length-1];
  if(!first||!last||first===last||Number(first.minute)>=Number(last.minute))return null;
  const hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1),hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1),hCorner=delta(first,last,'corner',0),aCorner=delta(first,last,'corner',1);
  if([hA,aA,hD,aD,hCorner,aCorner].some(v=>v===null))return null;
  const [hAttackPct,aAttackPct]=share(hA,aA),[hDangerousPct,aDangerousPct]=share(hD,aD);
  return {from:Number(first.minute),to:Number(last.minute),hA,aA,hD,aD,hCorner,aCorner,hAttackPct,aAttackPct,hDangerousPct,aDangerousPct};
}
function eventMetricsForPrediction(m){
  const f=rollingFootball(m,5);if(!f)return {pressureShare:50,trendPass:0};
  const hWeighted=Math.max(0,f.hA)+Math.max(0,f.hD),aWeighted=Math.max(0,f.aA)+Math.max(0,f.aD),total=hWeighted+aWeighted;
  return {pressureShare:total>0?(hWeighted/total)*100:50,trendPass:[f.hA>f.aA,f.hD>f.aD].filter(Boolean).length};
}
function implied(values){const raw=values.map(v=>1/Math.max(1.001,Number(v)||999)),sum=raw.reduce((a,b)=>a+b,0);return raw.map(v=>sum>0?v/sum:0)}
function normalize3(a,b,c){const sum=a+b+c||1,raw=[a/sum*100,b/sum*100,c/sum*100],rounded=raw.map(Math.round);let diff=100-rounded.reduce((x,y)=>x+y,0);for(let i=0;diff!==0;i=(i+1)%3){rounded[i]+=diff>0?1:-1;diff+=diff>0?-1:1}return rounded}
function normalize2(a,b){const sum=a+b||1,aa=Math.round(a/sum*100);return [aa,100-aa]}
function prediction(m,market){
  const one=market.oneXtwo,tot=market.totals,em=eventMetricsForPrediction(m);
  const [mh,md,ma]=implied([one.home,one.draw,one.away]),pressure=clamp((finite(em.pressureShare)??50)/100,.35,.80),trend=clamp((finite(em.trendPass)??0)/3,0,1);
  const scoreH=finite(m?.score?.[0])??0,scoreA=finite(m?.score?.[1])??0,homeBoost=clamp((pressure-.5)*.45+trend*.035+(scoreH-scoreA)*.025,0,.18),drawBoost=scoreH===scoreA?.018:0;
  const [homePct,drawPct,awayPct]=normalize3(mh+homeBoost,md+drawBoost,ma),onePick=homePct>=awayPct?'HOME':'AWAY';
  const [mo,mu]=implied([tot.over,tot.under]),f=rollingFootball(m,5),activity=clamp(((f?.hA||0)+(f?.aA||0))*0.002+((f?.hD||0)+(f?.aD||0))*0.005+((f?.hCorner||0)+(f?.aCorner||0))*.01,0,.16);
  const minute=finite(m.minute)??60,currentGoals=scoreH+scoreA,line=finite(tot.line)??2.5;let over=mo,under=mu;
  if(currentGoals>line){over=.99;under=.01}else{const remaining=clamp((95-minute)/40,0,1),near=currentGoals>=line-.5?.055:0;over=clamp(mo+activity*remaining+near,.05,.95);under=clamp(mu-activity*remaining-near,.05,.95)}
  const [overPct,underPct]=normalize2(over,under),ouPick=overPct>=underPct?'OVER':'UNDER';
  return {oneXtwo:{pick:onePick,home:homePct,draw:drawPct,away:awayPct},totals:{pick:ouPick,line,over:overPct,under:underPct}};
}
function normalizeCandidateStats(stats){const h=stats?.home||{},a=stats?.away||{};return {home:{shotOnTarget:finite(h.shotOnTarget),shotOff:finite(h.shotOff),possessionPct:finite(h.possession)},away:{shotOnTarget:finite(a.shotOnTarget),shotOff:finite(a.shotOff),possessionPct:finite(a.possession)}}}
function statsEvidence(rows,market,minutes){
  const now=finite(market?.observedAt)??Date.now(),windowMs=Number(minutes)*60*1000,latest=normalizeCandidateStats(market?.statistics);
  const usable=(Array.isArray(rows)?rows:[]).filter(x=>now-Number(x.observedAt||0)<=windowMs).sort((a,b)=>Number(a.observedAt)-Number(b.observedAt));
  const first=usable[0],last=usable[usable.length-1];
  const make=side=>{const f=first?.stats?.[side]||{},l=last?.stats?.[side]||latest?.[side]||{};return {
    shotOnTarget:first&&last&&first!==last&&finite(f.shotOnTarget)!==null&&finite(l.shotOnTarget)!==null?Math.max(0,finite(l.shotOnTarget)-finite(f.shotOnTarget)):null,
    shotOff:first&&last&&first!==last&&finite(f.shotOff)!==null&&finite(l.shotOff)!==null?Math.max(0,finite(l.shotOff)-finite(f.shotOff)):null,
    possessionPct:finite(l.possessionPct)
  }};
  return {home:make('home'),away:make('away'),from:first?.minute??null,to:last?.minute??market?.fixture?.minute??null};
}
function sideEvidence(football,stats,side){const home=side==='HOME',api=home?stats.home:stats.away;return {shotOnTarget:finite(api?.shotOnTarget),shotOff:finite(api?.shotOff),corner:home?finite(football?.hCorner):finite(football?.aCorner),dangerousAttackPct:home?finite(football?.hDangerousPct):finite(football?.aDangerousPct),attackPct:home?finite(football?.hAttackPct):finite(football?.aAttackPct),possessionPct:finite(api?.possessionPct)}}
function evaluateEvidence(values,cfg,direction){const checks={};let passCount=0;for(const key of EVIDENCE_KEYS){const value=finite(values?.[key]),limit=finite(cfg?.[key]),pass=value!==null&&limit!==null&&(direction==='MAX'?value<=limit:value>=limit);checks[key]={value,limit,pass};if(pass)passCount++}return {values,checks,passCount,required:Number(cfg?.evidenceRequired)||1,pass:passCount>=Number(cfg?.evidenceRequired||1)}}
function minutePass(minute,cfg){const n=finite(minute);return n!==null&&n>=Number(cfg.minuteFrom)&&n<=Number(cfg.minuteTo)}
function oddsOk(value,min){const n=finite(value),m=finite(min);return n!==null&&m!==null&&n>=m&&n<=100}
function lineOk(value,min){const n=finite(value),m=finite(min);return n!==null&&m!==null&&n>=m&&n<=20&&Number.isInteger(n*4)}
function lineRangeOk(value,min,max){const n=finite(value),lo=finite(min),hi=finite(max);return n!==null&&lo!==null&&hi!==null&&n>=lo&&n<=hi&&n<=20&&Number.isInteger(n*4)}
function selectedOddsOne(market,pick){return finite(pick==='HOME'?market?.oneXtwo?.home:market?.oneXtwo?.away)}
function chooseOneXtwo(pred,cfg){const mode=String(cfg?.sideMode||'BOTH').toUpperCase();if(mode==='HOME')return 'HOME';if(mode==='AWAY')return 'AWAY';return Number(pred?.home||0)>=Number(pred?.away||0)?'HOME':'AWAY'}
function trailingBy(score,pick){const h=finite(score?.[0]),a=finite(score?.[1]);if(h===null||a===null)return null;return pick==='HOME'?Math.max(0,a-h):Math.max(0,h-a)}
function rollingAsianHandicapEvidence(m,market,minutes){
  const current=finite(m?.minute),windowMinutes=Number(minutes),snaps=[...(m?.event?.snapshots||[])]
    .filter(s=>finite(s?.minute)!==null).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
  if(current===null||!Number.isFinite(windowMinutes))return null;
  const eligible=snaps.filter(s=>Number(s.minute)>=current-windowMinutes&&Number(s.minute)<=current),first=eligible[0],last=eligible[eligible.length-1];
  if(!first||!last||first===last||Number(first.minute)>=Number(last.minute))return null;
  const hSot=delta(first,last,'sot',0),aSot=delta(first,last,'sot',1),hOff=delta(first,last,'off',0),aOff=delta(first,last,'off',1);
  const hCorner=delta(first,last,'corner',0),aCorner=delta(first,last,'corner',1),hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1),hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1);
  const [hAttackPct,aAttackPct]=share(hA,aA),[hDangerousPct,aDangerousPct]=share(hD,aD),latest=normalizeCandidateStats(market?.statistics);
  return {from:Number(first.minute),to:Number(last.minute),home:{shotOnTarget:hSot,shotOff:hOff,corner:hCorner,dangerousAttackPct:hDangerousPct,attackPct:hAttackPct,possessionPct:finite(latest?.home?.possessionPct)},away:{shotOnTarget:aSot,shotOff:aOff,corner:aCorner,dangerousAttackPct:aDangerousPct,attackPct:aAttackPct,possessionPct:finite(latest?.away?.possessionPct)}};
}
function ahLineOk(value,min){const n=finite(value),m=finite(min);return n!==null&&m!==null&&n>=m&&n>=-20&&n<=20&&Number.isInteger(n*4)}
function ahSideQuote(quote,side){if(!quote||!['HOME','AWAY'].includes(side))return null;const raw=finite(quote.rawHomeLine);if(raw===null)return null;return side==='HOME'?{line:-raw,odds:finite(quote.homeOdds)}:{line:raw,odds:finite(quote.awayOdds)}}
function ahEvidenceStrength(e){const v=e?.values||{};return Number(e?.passCount||0)*1000+(finite(v.shotOnTarget)||0)*10+(finite(v.shotOff)||0)*4+(finite(v.corner)||0)*5+(finite(v.dangerousAttackPct)||0)+(finite(v.attackPct)||0)+(finite(v.possessionPct)||0)}
function asianHandicapGate(m,market,snapshot,quote){
  const run=Boolean(snapshot?.run?.ah),cfg=snapshot?.settings?.ah||null,reasons=[];
  if(!run||!cfg)return {market:'ah',pass:false,disabled:true,reasons:['ตลาดยังไม่ได้เริ่มทำงาน']};
  const minute=finite(m.minute);if(!minutePass(minute,cfg))reasons.push('อยู่นอกช่วงเวลาที่ตั้ง');
  const rolling=rollingAsianHandicapEvidence(m,market,cfg.rollingWindowMinutes);if(!rolling)reasons.push('ข้อมูลช่วงย้อนหลังยังไม่พร้อม');
  if(!quote)reasons.push('ยังไม่มีราคา Asian Handicap จาก Bet365');
  const mode=String(cfg.sideMode||'BOTH').toUpperCase(),allowed=mode==='BOTH'?['HOME','AWAY']:[mode],sides={};
  for(const side of ['HOME','AWAY']){
    const evidence=evaluateEvidence(rolling?.[side.toLowerCase()]||null,cfg,'MIN'),selected=ahSideQuote(quote,side),sideReasons=[];
    if(!evidence.pass)sideReasons.push(`หลักฐานผ่าน ${evidence.passCount}/${evidence.required}`);
    if(!selected||!ahLineOk(selected.line,cfg.lineMin))sideReasons.push('Asian Handicap Line ไม่ผ่านค่าที่ตั้ง');
    if(!selected||!oddsOk(selected.odds,cfg.oddsMin))sideReasons.push('Odds ต่ำกว่าที่ตั้ง');
    sides[side]={...evidence,line:selected?.line??null,odds:selected?.odds??null,pass:sideReasons.length===0,reasons:sideReasons,strength:ahEvidenceStrength(evidence)};
  }
  const passing=allowed.filter(side=>sides[side]?.pass).sort((a,b)=>sides[b].passCount-sides[a].passCount||sides[b].strength-sides[a].strength||Number(sides[a].odds||999)-Number(sides[b].odds||999));
  const pick=passing[0]||null,selected=pick?sides[pick]:null;if(!pick)reasons.push('ยังไม่มีฝั่งที่เลือกผ่านเหตุการณ์และราคา');
  const evidence={mode,sides,passingSides:passing,selectedSide:pick,pass:Boolean(pick),from:rolling?.from??null,to:rolling?.to??null};
  return {market:'ah',pass:reasons.length===0,disabled:false,reasons,minute,evidence,pick,line:selected?.line??null,rawLine:finite(quote?.rawHomeLine),odds:selected?.odds??null,homeOdds:finite(quote?.homeOdds),awayOdds:finite(quote?.awayOdds),rawHomeHk:finite(quote?.rawHomeHk),rawAwayHk:finite(quote?.rawAwayHk),probability:null,bookmaker:quote?.bookmaker||'Bet365',provider:quote?.provider||'Nowgoal',settings:{...cfg}};
}
function marketGate(name,m,row,snapshot,statRows){
  const run=Boolean(snapshot?.run?.[name]),cfg=snapshot?.settings?.[name]||null,market=row.market,pred=row.prediction,reasons=[];
  if(!run||!cfg)return {market:name,pass:false,disabled:true,reasons:['ตลาดยังไม่ได้ RUN']};
  const minute=finite(m.minute);if(!minutePass(minute,cfg))reasons.push('อยู่นอกช่วงเวลาที่ตั้ง');
  const football=rollingFootball(m,cfg.rollingWindowMinutes);if(!football)reasons.push('ข้อมูลช่วงย้อนหลังยังไม่พร้อม');
  const stats=statsEvidence(statRows,market,cfg.rollingWindowMinutes),homeEv=sideEvidence(football,stats,'HOME'),awayEv=sideEvidence(football,stats,'AWAY');
  let evidence=null,pick=null,odds=null,line=null,probability=null;
  if(name==='oneXtwo'){
    pick=chooseOneXtwo(pred.oneXtwo,cfg);odds=selectedOddsOne(market,pick);probability=finite(pick==='HOME'?pred?.oneXtwo?.home:pred?.oneXtwo?.away);
    if(!oddsOk(odds,cfg.oddsMin))reasons.push('ราคา odds ต่ำกว่าที่ตั้ง');
    const gap=trailingBy(m.score,pick);if(gap===null||gap>Number(cfg.scoreTrailingMax))reasons.push('ระยะห่างของสกอร์เกินที่ตั้ง');
    const sideMode=String(cfg.sideMode||'BOTH').toUpperCase();if(sideMode!=='BOTH'&&sideMode!==pick)reasons.push('ฝั่งที่เลือกไม่ตรงกับ Home / Away ที่ตั้ง');
    evidence=evaluateEvidence(pick==='HOME'?homeEv:awayEv,cfg,'MIN');if(!evidence.pass)reasons.push(`หลักฐานผ่าน ${evidence.passCount}/${evidence.required}`);
  }else if(name==='over'){
    pick='OVER';line=finite(market?.totals?.line);odds=finite(market?.totals?.over);probability=finite(pred?.totals?.over);
    if(!lineRangeOk(line,cfg.lineMin,cfg.lineMax))reasons.push('เส้น Over ไม่อยู่ในช่วงที่ตั้ง');if(!oddsOk(odds,cfg.oddsMin))reasons.push('ราคา odds ต่ำกว่าที่ตั้ง');
    const home=evaluateEvidence(homeEv,cfg,'MIN'),away=evaluateEvidence(awayEv,cfg,'MIN'),passSides=[['HOME',home],['AWAY',away]].filter(([,e])=>e.pass).sort((a,b)=>b[1].passCount-a[1].passCount);
    evidence={mode:'EITHER',sides:{HOME:home,AWAY:away},passingSides:passSides.map(x=>x[0]),selectedSide:passSides[0]?.[0]||null,pass:passSides.length>0};if(!evidence.pass)reasons.push('ยังไม่มีฝั่งใดผ่านหลักฐานที่ตั้ง');
  }else{
    pick='UNDER';line=finite(market?.totals?.line);odds=finite(market?.totals?.under);probability=finite(pred?.totals?.under);
    if(!lineOk(line,cfg.lineMin))reasons.push('เส้น Under ต่ำกว่าที่ตั้ง');if(!oddsOk(odds,cfg.oddsMin))reasons.push('ราคา odds ต่ำกว่าที่ตั้ง');
    const home=evaluateEvidence(homeEv,cfg,'MAX'),away=evaluateEvidence(awayEv,cfg,'MAX'),mode=String(cfg.sideMode||'BOTH').toUpperCase(),pass=mode==='HOME'?home.pass:mode==='AWAY'?away.pass:home.pass&&away.pass;
    evidence={mode,sides:{HOME:home,AWAY:away},passingSides:[home.pass?'HOME':null,away.pass?'AWAY':null].filter(Boolean),selectedSide:mode,pass};if(!pass)reasons.push('หลักฐานเกมเงียบยังไม่ผ่านตามฝั่งที่ตั้ง');
  }
  return {market:name,pass:reasons.length===0,disabled:false,reasons,minute,football,stats,evidence,pick,line,odds,probability,settings:{...cfg}};
}
function buildSignals(m,row,snapshot,statRows,ahQuote=null){
  const gates={oneXtwo:marketGate('oneXtwo',m,row,snapshot,statRows),over:marketGate('over',m,row,snapshot,statRows),under:marketGate('under',m,row,snapshot,statRows),ah:asianHandicapGate(m,row.market,snapshot,ahQuote)},signals=[];
  if(gates.oneXtwo.pass)signals.push({market:'1X2',pick:gates.oneXtwo.pick,odds:gates.oneXtwo.odds,probability:gates.oneXtwo.probability,home:finite(row.prediction?.oneXtwo?.home),away:finite(row.prediction?.oneXtwo?.away),gate:gates.oneXtwo,settings:gates.oneXtwo.settings});
  let totalsGate=null;if(gates.over.pass&&gates.under.pass)totalsGate=String(row.prediction?.totals?.pick||'').toUpperCase()==='UNDER'?gates.under:gates.over;else if(gates.over.pass)totalsGate=gates.over;else if(gates.under.pass)totalsGate=gates.under;
  if(totalsGate)signals.push({market:totalsGate.pick,pick:totalsGate.pick,line:totalsGate.line,odds:totalsGate.odds,probability:totalsGate.probability,over:finite(row.prediction?.totals?.over),under:finite(row.prediction?.totals?.under),gate:totalsGate,settings:totalsGate.settings});
  if(gates.ah.pass)signals.push({market:'AH',marketLabel:'Asian Handicap',pick:gates.ah.pick,line:gates.ah.line,rawLine:gates.ah.rawLine,odds:gates.ah.odds,homeOdds:gates.ah.homeOdds,awayOdds:gates.ah.awayOdds,rawHomeHk:gates.ah.rawHomeHk,rawAwayHk:gates.ah.rawAwayHk,probability:null,bookmaker:gates.ah.bookmaker,provider:gates.ah.provider,gate:gates.ah,settings:gates.ah.settings});
  return {signals,gates};
}
function signalFamily(market){const name=String(market||'').toUpperCase();if(name==='1X2')return'oneXtwo';if(name==='AH')return'ah';if(name==='OVER'||name==='UNDER')return'totals';return null}
function lockedFamilies(record){const out=new Set();if(!record)return out;if(Array.isArray(record.signals)){for(const signal of record.signals){const family=signalFamily(signal?.market);if(family)out.add(family)}return out}if(record?.prediction?.oneXtwo)out.add('oneXtwo');if(record?.prediction?.totals)out.add('totals');return out}
function settingsFamily(name){return name==='oneXtwo'?'oneXtwo':name==='ah'?'ah':'totals'}
function eligibleByTime(m,snapshot,record=null){const minute=finite(m?.minute);if(minute===null||m?.freshness?.stale)return false;const locked=lockedFamilies(record);return MARKETS.some(name=>snapshot.run[name]&&snapshot.settings[name]&&!locked.has(settingsFamily(name))&&minute>=Number(snapshot.settings[name].minuteFrom)&&minute<=Number(snapshot.settings[name].minuteTo))}
function filterNewSignals(signals,record=null){const seen=lockedFamilies(record),out=[];for(const signal of Array.isArray(signals)?signals:[]){const family=signalFamily(signal?.market);if(!family||seen.has(family))continue;seen.add(family);out.push(signal)}return out}
function candidateUrl(m){const u=new URL(MARKET_URL);u.searchParams.set('home',m.home||'');u.searchParams.set('away',m.away||'');u.searchParams.set('minute',String(m.minute??''));u.searchParams.set('scoreHome',String(m.score?.[0]??''));u.searchParams.set('scoreAway',String(m.score?.[1]??''));return u.toString()}
function lockPayload(m,market,signals){const ah=signals.find(signal=>signal.market==='AH');return {schemaVersion:3,capturedAt:Date.now(),matchId:String(m.id),fixtureId:String(market?.fixture?.id||''),league:typeof m.league==='object'?String(m.league?.name||''):String(m.league||''),home:m.home||'',away:m.away||'',minute:m.minute,entryScore:m.score,settingsVersion:SETTINGS_VERSION,signals,market:{provider:market.provider||'Nowgoal',observedAt:market.observedAt||Date.now(),fixture:market.fixture||null,oneXtwo:market.oneXtwo||null,totals:market.totals||null,asianHandicap:ah?{line:ah.rawLine,selectedLine:ah.line,homeOdds:ah.homeOdds??null,awayOdds:ah.awayOdds??null,rawHomeHk:ah.rawHomeHk??null,rawAwayHk:ah.rawAwayHk??null,selectedOdds:ah.odds,bookmaker:ah.bookmaker||'Bet365',provider:ah.provider||'Nowgoal',linePerspective:'HOME'}:null,statistics:market.statistics||null}}}

export {hkToDecimal,parseAsianHandicapQuotes,ahSideQuote,signalFamily,lockedFamilies,filterNewSignals};

export class SignalEngine{
  constructor(state,env){this.state=state;this.env=env}
  async snapshot(){return normalizeSnapshot((await this.state.storage.get('settings'))||emptySnapshot())}
  async saveSnapshot(input){const next=normalizeSnapshot(input),errors=validateSnapshot(next);if(errors.length)throw new Error(`INVALID_SETTINGS:${errors.join(',')}`);next.updatedAt=Date.now();next.run.updatedAt=next.updatedAt;await this.state.storage.put('settings',next);return next}
  async statRows(id){return (await this.state.storage.get(`stats:${id}`))||[]}
  async rememberStats(id,market){
    const now=finite(market?.observedAt)??Date.now(),minute=finite(market?.fixture?.minute),stats=normalizeCandidateStats(market?.statistics),rows=await this.statRows(id),row={observedAt:now,minute,stats};
    let next=rows.filter(x=>finite(x?.observedAt)!==null&&now-Number(x.observedAt)<=32*60*1000);
    if(next.length&&Number(next[next.length-1]?.observedAt)===now)next=[...next.slice(0,-1),row];else next.push(row);
    next=next.slice(-40);await this.state.storage.put(`stats:${id}`,next);return next;
  }
  async settings(request){
    if(request.method==='GET'){const snapshot=await this.snapshot();return json(request,{ok:true,version:VERSION,snapshot})}
    const origin=request.headers.get('origin')||'';if(!ALLOWED_ORIGINS.has(origin))return json(request,{ok:false,error:'write_origin_not_allowed'},403);
    let body;try{body=await request.json()}catch{return json(request,{ok:false,error:'invalid_json'},400)}
    try{const snapshot=await this.saveSnapshot(body?.snapshot||body);return json(request,{ok:true,version:VERSION,snapshot},200)}
    catch(error){return json(request,{ok:false,error:String(error?.message||error)},400)}
  }
  async health(request){
    const snapshot=await this.snapshot(),lastScan=(await this.state.storage.get('lastScan'))||null;
    return json(request,{ok:true,service:'nomadtips3-342-signal-engine',version:VERSION,serverRun:true,cron:'* * * * *',run:snapshot.run,settingsUpdatedAt:iso(snapshot.updatedAt),lastScan});
  }
  async scan(request){
    const started=Date.now(),snapshot=await this.snapshot();
    if(!anyRunning(snapshot)){const result={at:iso(started),status:'IDLE',reason:'all_markets_stopped',processed:0,locked:0};await this.state.storage.put('lastScan',result);return json(request,{ok:true,version:VERSION,scan:result})}
    try{
      const [feed,ledger]=await Promise.all([
        fetchJson(`${FEED_URL}?force=1&t=${started}`),
        fetchJson(`${LEDGER_URL}/signal?limit=500&t=${started}`)
      ]);
      if(feed?.ok===false||feed?.version!=='3.42'||!Array.isArray(feed?.matches))throw new Error('LIVE_FEED_CONTRACT');
      let ahQuotes=new Map(),ahSourceError=null;
      if(snapshot.run.ah){try{ahQuotes=await fetchAsianHandicapQuotes(started)}catch(error){ahSourceError=String(error?.message||error).slice(0,160)}}
      const existingById=new Map((Array.isArray(ledger?.records)?ledger.records:[]).map(record=>[String(record?.matchId||''),record]).filter(([id])=>id));
      let matches=feed.matches.filter(m=>m?.id&&eligibleByTime(m,snapshot,existingById.get(String(m.id))||null));
      const cursor=Math.max(0,Number(await this.state.storage.get('cursor'))||0),total=matches.length;
      if(total>MAX_MATCHES_PER_SCAN){const rotated=[...matches.slice(cursor%total),...matches.slice(0,cursor%total)];matches=rotated.slice(0,MAX_MATCHES_PER_SCAN);await this.state.storage.put('cursor',(cursor+MAX_MATCHES_PER_SCAN)%total)}else await this.state.storage.put('cursor',0);
      const details=[];let locked=0;
      for(const m of matches){
        try{
          const market=await fetchJson(candidateUrl(m),{headers:{origin:'https://www.nomadtips3.com'}},MARKET_TIMEOUT_MS);
          if(!market?.ok||!market?.oneXtwo||!market?.totals||!market?.statistics)throw new Error(market?.error||'candidate_incomplete');
          const statRows=await this.rememberStats(String(m.id),market),row={market,prediction:prediction(m,market)},ahQuote=ahQuotes.get(String(market?.fixture?.id||''))||null,evaluated=buildSignals(m,row,snapshot,statRows,ahQuote),existing=existingById.get(String(m.id))||null,newSignals=filterNewSignals(evaluated.signals,existing);
          if(!newSignals.length){details.push({matchId:String(m.id),status:evaluated.signals.length?'ALREADY_LOCKED':'WAIT',gates:Object.fromEntries(Object.entries(evaluated.gates).map(([k,g])=>[k,g.reasons]))});continue}
          const ack=await fetchJson(`${LEDGER_URL}/lock`,{method:'POST',headers:{'content-type':'application/json',origin:'https://www.nomadtips3.com'},body:JSON.stringify(lockPayload(m,market,newSignals))},REMOTE_TIMEOUT_MS);
          if(ack?.locked===true&&!ack?.duplicate)locked++;
          if(ack?.record)existingById.set(String(m.id),ack.record);
          details.push({matchId:String(m.id),status:ack?.appended?'APPENDED':ack?.duplicate?'DUPLICATE':'LOCKED',signals:newSignals.map(s=>s.market)});
        }catch(error){details.push({matchId:String(m.id),status:'ERROR',error:String(error?.message||error).slice(0,180)})}
      }
      const result={at:iso(started),status:'RUNNING',feedMatches:feed.matches.length,eligible:total,processed:matches.length,locked,run:snapshot.run,asianHandicapSource:{enabled:Boolean(snapshot.run.ah),quotes:ahQuotes.size,error:ahSourceError},details};
      await this.state.storage.put('lastScan',result);return json(request,{ok:true,version:VERSION,scan:result});
    }catch(error){
      const result={at:iso(started),status:'ERROR',error:String(error?.message||error).slice(0,240),processed:0,locked:0,run:snapshot.run};
      await this.state.storage.put('lastScan',result);return json(request,{ok:false,version:VERSION,scan:result},502);
    }
  }
  async fetch(request){
    if(request.method==='OPTIONS')return json(request,{},204);
    const url=new URL(request.url);
    if((url.pathname==='/'||url.pathname==='/health')&&request.method==='GET')return this.health(request);
    if(url.pathname==='/settings'&&['GET','POST'].includes(request.method))return this.settings(request);
    if(url.pathname==='/__scheduled_scan'&&request.method==='POST')return this.scan(request);
    return json(request,{ok:false,error:'not_found'},404);
  }
}
export default{
  async fetch(request,env){if(request.method==='OPTIONS')return json(request,{},204);const id=env.ENGINE.idFromName('primary');return env.ENGINE.get(id).fetch(request)},
  async scheduled(_controller,env,ctx){const id=env.ENGINE.idFromName('primary'),request=new Request('https://nomad342.internal/__scheduled_scan',{method:'POST'});ctx.waitUntil(env.ENGINE.get(id).fetch(request).then(r=>{if(!r.ok)throw new Error(`SIGNAL_SCAN_HTTP_${r.status}`)}))}
};
