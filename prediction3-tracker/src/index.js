const LEDGER_URL='https://www.nomadtips3.com/prediction3/data/ledger.json';
const LIVE_URL='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
const FINAL_URL='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/finals';
const REFRESH_MS=20000;
const MAX_RECORDS=100;
const FINAL_FALLBACK_AFTER_MS=75*60*1000;

const CORS={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'content-type':'application/json; charset=utf-8'}});
const now=()=>Date.now();
const iso=value=>new Date(value||Date.now()).toISOString();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

async function fetchJson(url){
  const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store',headers:{'accept':'application/json'}});
  if(!response.ok)throw new Error(`http_${response.status}`);
  return response.json();
}

const LATIN_FOLD=Object.freeze({
  'ł':'l','Ł':'L','ø':'o','Ø':'O','đ':'d','Đ':'D','ð':'d','Ð':'D',
  'þ':'th','Þ':'TH','æ':'ae','Æ':'AE','œ':'oe','Œ':'OE','ß':'ss',
});
const IGNORED_TEAM_TOKENS=new Set(['fc','cf','sc','ac','afc','club','de','the','stade','olympique','football','al']);
export function foldLatin(value){
  return String(value||'')
    .replace(/[łŁøØđĐðÐþÞæÆœŒß]/g,ch=>LATIN_FOLD[ch]||ch)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'');
}
export function tokens(value){
  return foldLatin(value).toLowerCase().match(/[a-z0-9]+/g)?.filter(x=>!IGNORED_TEAM_TOKENS.has(x))||[];
}
function tokenLike(a,b){return a===b||(a.length>=4&&b.length>=4&&a.slice(0,4)===b.slice(0,4));}
export function teamScore(a,b){
  const aa=tokens(a),bb=tokens(b);
  if(!aa.length||!bb.length)return 0;
  let matched=0;
  for(const x of aa)if(bb.some(y=>tokenLike(x,y)))matched+=1;
  return matched/Math.max(aa.length,bb.length);
}
function rowId(row){return String(row?.id??row?.fixtureId??'');}
export function fixtureIdentityMatches(item,row){
  if(!item||!row)return false;
  return teamScore(item?.home,row?.home)>=0.75&&teamScore(item?.away,row?.away)>=0.75;
}
export function kickoffMs(item){
  const raw=item?.tracking?.kickoffUtc||item?.kickoffAt||null;
  if(!raw)return null;
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:null;
}
export function finalFallbackEligible(item,at=now()){
  const kickoff=kickoffMs(item);
  return kickoff!==null&&Number(at)>=kickoff+FINAL_FALLBACK_AFTER_MS;
}
export function fixtureFor(item,rows,{knownFixtureId=null,final=false,at=now()}={}){
  const configuredIds=[item?.tracking?.fixtureId,item?.fixtureId].map(value=>String(value??'').trim()).filter(Boolean);
  for(const id of configuredIds){
    const exact=(rows||[]).find(row=>rowId(row)===id);
    if(exact)return exact;
  }

  const learnedId=String(knownFixtureId??'').trim();
  if(learnedId){
    const learned=(rows||[]).find(row=>rowId(row)===learnedId);
    // Runtime fixture IDs are learned from a name match. Never let a bad learned ID
    // become authoritative: it must still identify the same home/away pair.
    if(learned&&fixtureIdentityMatches(item,learned))return learned;
  }

  if(final&&!finalFallbackEligible(item,at))return null;

  const candidates=[];
  for(const row of rows||[]){
    const hs=teamScore(item?.home,row?.home),as=teamScore(item?.away,row?.away);
    if(hs>=0.75&&as>=0.75)candidates.push({row,score:hs+as});
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.score-a.score);
  // If two provider rows are effectively tied, do not guess an ID from team names.
  if(candidates.length>1&&Math.abs(candidates[0].score-candidates[1].score)<0.05&&rowId(candidates[0].row)!==rowId(candidates[1].row))return null;
  return candidates[0].row;
}
function scorePair(row){
  const raw=Array.isArray(row?.score)?row.score:[row?.score?.home,row?.score?.away];
  const home=finite(raw?.[0]),away=finite(raw?.[1]);
  return home===null||away===null?null:[home,away];
}
function pickSide(item){
  const explicit=String(item?.tracking?.pickSide||item?.pickSide||'').toLowerCase();
  if(explicit==='home'||explicit==='away'||explicit==='draw')return explicit;
  const pick=String(item?.pick||'');
  const home=teamScore(pick,item?.home),away=teamScore(pick,item?.away);
  if(home>away&&home>=0.5)return 'home';
  if(away>home&&away>=0.5)return 'away';
  if(/\bdraw\b|\bx\b/i.test(pick))return 'draw';
  return null;
}
function settle1x2(item,score){
  if(!score)return null;
  const [home,away]=score;
  const actual=home>away?'home':away>home?'away':'draw';
  const side=pickSide(item);
  if(!side)return null;
  return {result:side===actual?'WIN':'LOSS',actual,pickSide:side};
}
export function sanitizeExisting(item,existing={},at=now()){
  const kickoff=kickoffMs(item);
  const hasSettlement=Boolean(existing?.result||existing?.status==='FT'||existing?.settledAt);
  if(!hasSettlement||kickoff===null||Number(at)>=kickoff+FINAL_FALLBACK_AFTER_MS)return existing;
  const clean={...existing};
  clean.status='SCHEDULED';
  clean.score=null;
  clean.minute=null;
  clean.result=null;
  clean.settledAt=null;
  clean.actual=null;
  clean.fixtureId=null;
  return clean;
}
function recordFromPick(item,existing={}){
  const kickoffUtc=item?.tracking?.kickoffUtc||item?.kickoffAt||existing.kickoffUtc||null;
  return {
    ...existing,
    id:String(item?.id||existing.id||''),
    date:item?.date||existing.date||null,
    league:item?.league||existing.league||null,
    round:item?.round||existing.round||null,
    home:item?.home||existing.home||null,
    away:item?.away||existing.away||null,
    pick:item?.pick||existing.pick||null,
    market:item?.market||existing.market||'1X2',
    odds:finite(item?.referenceOdds??item?.odds??existing.odds),
    kickoffUtc,
    fixtureId:String(item?.tracking?.fixtureId??existing.fixtureId??'')||null,
    pickSide:pickSide(item)||existing.pickSide||null,
    status:existing.status||'SCHEDULED',
    score:existing.score||null,
    minute:existing.minute??null,
    result:existing.result||null,
    settledAt:existing.settledAt||null,
    source:'TotalCorner V3',
  };
}

export class Prediction3Tracker{
  constructor(state,env){this.state=state;this.env=env;}

  async refresh(force=false){
    const last=finite(await this.state.storage.get('lastRefreshAt'))||0;
    if(!force&&last&&now()-last<REFRESH_MS)return this.snapshot();

    const current=Array.isArray(await this.state.storage.get('records'))?(await this.state.storage.get('records')):[];
    const byId=new Map(current.map(row=>[String(row.id),row]));
    const errors=[];

    let ledger=null,live={matches:[]},finals={finals:[]};
    const responses=await Promise.allSettled([fetchJson(LEDGER_URL),fetchJson(LIVE_URL),fetchJson(FINAL_URL)]);
    if(responses[0].status==='fulfilled')ledger=responses[0].value;else errors.push(`ledger:${responses[0].reason}`);
    if(responses[1].status==='fulfilled')live=responses[1].value;else errors.push(`live:${responses[1].reason}`);
    if(responses[2].status==='fulfilled')finals=responses[2].value;else errors.push(`finals:${responses[2].reason}`);

    if(ledger&&Array.isArray(ledger.today)){
      const refreshedAt=now();
      for(const item of ledger.today){
        if(!item?.id)continue;
        const previous=sanitizeExisting(item,byId.get(String(item.id))||{},refreshedAt);
        const record=recordFromPick(item,previous);
        const configuredFixtureId=String(item?.tracking?.fixtureId??item?.fixtureId??'').trim();
        let knownFixtureId=record.fixtureId||previous.fixtureId||null;

        // Heal a previously learned wrong ID as soon as that provider row is visible.
        if(knownFixtureId&&!configuredFixtureId){
          const allRows=[...(Array.isArray(live?.matches)?live.matches:[]),...(Array.isArray(finals?.finals)?finals.finals:[])];
          const learnedRow=allRows.find(row=>rowId(row)===String(knownFixtureId));
          if(learnedRow&&!fixtureIdentityMatches(item,learnedRow)){
            record.fixtureId=null;
            knownFixtureId=null;
          }
        }

        const finalRow=fixtureFor(item,Array.isArray(finals?.finals)?finals.finals:[],{knownFixtureId,final:true,at:refreshedAt});
        const liveRow=fixtureFor(item,Array.isArray(live?.matches)?live.matches:[],{knownFixtureId,final:false,at:refreshedAt});

        if(finalRow){
          const finalScore=scorePair(finalRow);
          const settlement=String(item?.market||'1X2').toUpperCase()==='1X2'?settle1x2(item,finalScore):null;
          record.fixtureId=rowId(finalRow)||record.fixtureId;
          record.status='FT';
          record.score=finalScore;
          record.minute=null;
          if(settlement){
            record.result=settlement.result;
            record.pickSide=settlement.pickSide;
            record.actual=settlement.actual;
            record.settledAt=record.settledAt||iso();
          }
        }else if(liveRow){
          record.fixtureId=rowId(liveRow)||record.fixtureId;
          record.status='LIVE';
          record.score=scorePair(liveRow);
          record.minute=finite(liveRow?.minute);
          record.result=null;
          record.settledAt=null;
          record.actual=null;
        }else if(!record.result){
          record.status='SCHEDULED';
          record.score=null;
          record.minute=null;
        }
        byId.set(record.id,record);
      }
    }

    const records=[...byId.values()]
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))
      .slice(0,MAX_RECORDS);
    const refreshedAt=now();
    await this.state.storage.put({records,lastRefreshAt:refreshedAt,lastErrors:errors});
    return {ok:true,updatedAt:iso(refreshedAt),records,errors};
  }

  async snapshot(){
    const records=Array.isArray(await this.state.storage.get('records'))?(await this.state.storage.get('records')):[];
    const lastRefreshAt=finite(await this.state.storage.get('lastRefreshAt'))||0;
    const errors=Array.isArray(await this.state.storage.get('lastErrors'))?(await this.state.storage.get('lastErrors')):[];
    return {ok:true,updatedAt:lastRefreshAt?iso(lastRefreshAt):null,records,errors};
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    if(url.pathname==='/refresh')return json(await this.refresh(url.searchParams.get('force')==='1'));
    if(url.pathname==='/state')return json(url.searchParams.get('refresh')==='1'?await this.refresh(false):await this.snapshot());
    if(url.pathname==='/'||url.pathname==='/health'){
      const snap=await this.snapshot();
      return json({ok:true,component:'prediction3-tracker',updatedAt:snap.updatedAt,records:snap.records.length,errors:snap.errors});
    }
    return json({ok:false,error:'not_found'},404);
  }
}

function tracker(env){return env.TRACKER.get(env.TRACKER.idFromName('prediction3'));}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    return tracker(env).fetch(request);
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(tracker(env).fetch('https://tracker.internal/refresh?force=1'));
  },
};