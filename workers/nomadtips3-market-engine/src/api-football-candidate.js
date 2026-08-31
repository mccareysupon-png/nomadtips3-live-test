const BASE_URL='https://v3.football.api-sports.io';
const FIXTURE_CACHE_MS=180000;
const DEFAULT_TIMEOUT_MS=6000;
let fixtureCache={at:0,rows:[],quota:null};

function finite(value){if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function norm(value=''){return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/\b(fc|cf|sc|afc|fk|club)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function compact(value=''){return norm(value).replace(/\s+/g,'')}
function teamScore(a,b){const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;if(compact(x)===compact(y))return .99;if(x.length>=5&&y.length>=5&&(x.includes(y)||y.includes(x)))return .9;const A=new Set(x.split(' ').filter(Boolean)),B=new Set(y.split(' ').filter(Boolean));let hit=0;for(const t of A)if(B.has(t))hit++;const union=A.size+B.size-hit;return union?hit/union:0}
function apiUrl(path,params={}){const url=new URL(path,`${BASE_URL}/`);for(const [k,v] of Object.entries(params))if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,String(v));return url.toString()}
function apiErrors(errors){if(Array.isArray(errors))return errors.filter(Boolean);if(errors&&typeof errors==='object')return Object.entries(errors).filter(([,v])=>v).map(([k,v])=>`${k}:${v}`);if(typeof errors==='string'&&errors.trim())return [errors.trim()];return []}
function quotaFrom(response){return {remainingDay:finite(response.headers.get('x-ratelimit-requests-remaining')),remainingMinute:finite(response.headers.get('x-ratelimit-remaining'))}}
function minQuota(...items){const vals=k=>items.map(x=>finite(x?.[k])).filter(v=>v!==null);const d=vals('remainingDay'),m=vals('remainingMinute');return {remainingDay:d.length?Math.min(...d):null,remainingMinute:m.length?Math.min(...m):null}}

async function apiFetch(apiKey,path,params={},timeoutMs=DEFAULT_TIMEOUT_MS){
  if(!apiKey)throw new Error('API_FOOTBALL_KEY_MISSING');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort('API_FOOTBALL_TIMEOUT'),timeoutMs);
  try{
    const response=await fetch(apiUrl(path,params),{headers:{accept:'application/json','x-apisports-key':apiKey,'user-agent':'NOMADTIPS3-MARKET/1.0'},cache:'no-store',signal:controller.signal});
    const text=await response.text();
    if(!response.ok)throw new Error(`API_FOOTBALL_HTTP_${response.status}:${text.slice(0,160)}`);
    let payload={};try{payload=text?JSON.parse(text):{}}catch{throw new Error('API_FOOTBALL_INVALID_JSON')}
    const errors=apiErrors(payload?.errors);if(errors.length)throw new Error(`API_FOOTBALL_ERRORS:${errors.join('|').slice(0,200)}`);
    return {rows:Array.isArray(payload?.response)?payload.response:[],quota:quotaFrom(response),paging:payload?.paging||null};
  }finally{clearTimeout(timer)}
}

function liveFixtureRow(row){return {id:String(row?.fixture?.id??''),home:String(row?.teams?.home?.name||''),away:String(row?.teams?.away?.name||''),minute:finite(row?.fixture?.status?.elapsed),score:[finite(row?.goals?.home),finite(row?.goals?.away)],league:String(row?.league?.name||'')}}
async function liveFixtures(apiKey,timeoutMs,now=Date.now()){
  if(fixtureCache.rows.length&&now-fixtureCache.at<FIXTURE_CACHE_MS)return {rows:fixtureCache.rows,quota:fixtureCache.quota,requests:0,cache:'HIT'};
  const res=await apiFetch(apiKey,'/fixtures',{live:'all'},timeoutMs),rows=res.rows.map(liveFixtureRow).filter(x=>x.id&&x.home&&x.away);
  fixtureCache={at:now,rows,quota:res.quota};return {rows,quota:res.quota,requests:1,cache:'REFRESHED'};
}
function matchFixture(query,rows){
  const candidates=[];
  for(const row of rows){
    const h=teamScore(query.home,row.home),a=teamScore(query.away,row.away);if(h<.58||a<.58)continue;
    let score=(h+a)/2;
    const qm=finite(query.minute),rm=finite(row.minute);if(qm!==null&&rm!==null&&Math.abs(qm-rm)<=8)score+=.035;
    if(Array.isArray(query.score)&&Array.isArray(row.score)&&query.score.every((v,i)=>finite(v)!==null&&finite(v)===finite(row.score[i])))score+=.05;
    candidates.push({row,score,h,a});
  }
  candidates.sort((x,y)=>y.score-x.score);const best=candidates[0],second=candidates[1];
  if(!best||best.score<.70)return null;if(second&&best.score-second.score<.045)return null;return {...best.row,matchConfidence:Number(best.score.toFixed(3))};
}

function fullMatchMarket(name){const n=norm(name);return !/(1st|2nd|first|second|half|corner|card|period|team total|home team|away team)/.test(n)}
function oddValue(row){const n=finite(row?.odd??row?.odds??row?.price??row?.decimal);return n!==null&&n>1&&n<100?n:null}
function label(row){return String(row?.value??row?.name??row?.label??row?.team??'').trim()}
function bookName(event,market){return String(market?.bookmaker?.name??market?.bookmaker??event?.bookmaker?.name??event?.bookmaker??'API-Football').trim()||'API-Football'}
function classify1x2(raw,home,away){const n=norm(raw);if(n==='1'||/^home(\s|$)/.test(n)||teamScore(raw,home)>=.82)return 'home';if(n==='x'||n==='draw')return 'draw';if(n==='2'||/^away(\s|$)/.test(n)||teamScore(raw,away)>=.82)return 'away';return null}
function oneXtwoCandidates(events=[]){
  const out=[];
  for(const event of events){
    const home=event?.teams?.home?.name||'',away=event?.teams?.away?.name||'';
    for(const market of Array.isArray(event?.odds)?event.odds:[]){
      const name=String(market?.name||''),n=norm(name);if(!fullMatchMarket(name)||!/(match winner|1x2|full time result|fulltime result|winner)/.test(n))continue;
      const found={};let main=0;
      for(const v of Array.isArray(market?.values)?market.values:[]){if(v?.suspended===true)continue;const side=classify1x2(label(v),home,away),odd=oddValue(v);if(!side||odd===null)continue;found[side]=odd;if(v?.main===true)main++}
      if(found.home&&found.draw&&found.away)out.push({home:found.home,draw:found.draw,away:found.away,bookmaker:bookName(event,market),betName:name,main});
    }
  }
  return out.sort((a,b)=>b.main-a.main||a.home+a.draw+a.away-(b.home+b.draw+b.away));
}
function parseLine(row){const direct=finite(row?.handicap??row?.line??row?.total);if(direct!==null)return Math.abs(direct);const m=label(row).replace(',','.').match(/(?:over|under)\s*([0-9]+(?:\.[0-9]+)?)/i);return m?finite(m[1]):null}
function totalsCandidates(events=[]){
  const out=[];
  for(const event of events){
    for(const market of Array.isArray(event?.odds)?event.odds:[]){
      const name=String(market?.name||''),n=norm(name);if(!fullMatchMarket(name)||!/(over under|total goals|goals over under|goals total|total)/.test(n))continue;
      const byLine=new Map();
      for(const v of Array.isArray(market?.values)?market.values:[]){if(v?.suspended===true)continue;const raw=label(v),side=/^over\b/i.test(raw)?'over':/^under\b/i.test(raw)?'under':null,line=parseLine(v),odd=oddValue(v);if(!side||line===null||odd===null)continue;const key=line.toFixed(3),row=byLine.get(key)||{line,main:0};row[side]=odd;if(v?.main===true)row.main++;byLine.set(key,row)}
      for(const row of byLine.values())if(row.over&&row.under)out.push({...row,bookmaker:bookName(event,market),betName:name});
    }
  }
  return out.sort((a,b)=>b.main-a.main||Math.abs(a.over-a.under)-Math.abs(b.over-b.under));
}
export function parseCandidateOdds(events=[]){return {oneXtwo:oneXtwoCandidates(events)[0]||null,totals:totalsCandidates(events)[0]||null}}

export async function fetchApiFootballCandidate(apiKey,query={},timeoutMs=DEFAULT_TIMEOUT_MS,now=Date.now()){
  const home=String(query.home||'').trim(),away=String(query.away||'').trim();if(!home||!away)throw new Error('CANDIDATE_TEAMS_REQUIRED');
  const fixtures=await liveFixtures(apiKey,timeoutMs,now),fixture=matchFixture({home,away,minute:query.minute,score:query.score},fixtures.rows);
  if(!fixture)return {ok:false,error:'fixture_not_found',home,away,fixtureCache:fixtures.cache,requestsUsed:fixtures.requests,quota:fixtures.quota};
  const odds=await apiFetch(apiKey,'/odds/live',{fixture:fixture.id},timeoutMs),parsed=parseCandidateOdds(odds.rows),requestsUsed=fixtures.requests+1;
  if(!parsed.oneXtwo||!parsed.totals)return {ok:false,error:'markets_incomplete',home,away,fixture,oneXtwo:parsed.oneXtwo,totals:parsed.totals,fixtureCache:fixtures.cache,requestsUsed,quota:minQuota(fixtures.quota,odds.quota)};
  return {ok:true,version:'api-football-candidate-v1',provider:'API-Football',home,away,fixture,oneXtwo:parsed.oneXtwo,totals:parsed.totals,observedAt:now,fixtureCache:fixtures.cache,requestsUsed,quota:minQuota(fixtures.quota,odds.quota)};
}

export function resetFixtureCache(){fixtureCache={at:0,rows:[],quota:null}}
export {matchFixture,teamScore};
