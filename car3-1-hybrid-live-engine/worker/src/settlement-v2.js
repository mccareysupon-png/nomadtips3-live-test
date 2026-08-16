import upgradedWorker, { Car31State as UpgradedCar31State } from './upgrade.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});

function splitQuarterLine(value){
  const raw=num(value);
  if(raw===null)return [];
  const q=Math.round(raw*4)/4;
  const quarterIndex=Math.round(q*4);
  if(Math.abs(quarterIndex)%2===1)return[(quarterIndex-1)/4,(quarterIndex+1)/4];
  return[q];
}

function legResult(value){
  if(value>1e-9)return'W';
  if(value<-1e-9)return'L';
  return'P';
}

function combineLegs(legs){
  if(!legs.length)return'VOID';
  const w=legs.filter(x=>x==='W').length,l=legs.filter(x=>x==='L').length,p=legs.filter(x=>x==='P').length;
  if(w===legs.length)return'FULL_WIN';
  if(l===legs.length)return'FULL_LOSS';
  if(p===legs.length)return'PUSH';
  if(w>0&&p>0&&l===0)return'HALF_WIN';
  if(l>0&&p>0&&w===0)return'HALF_LOSS';
  return'PUSH';
}

function resultGroup(exact){
  if(exact==='FULL_WIN'||exact==='HALF_WIN')return'WIN';
  if(exact==='FULL_LOSS'||exact==='HALF_LOSS')return'LOSS';
  if(exact==='PUSH')return'DRAW';
  return exact==='PENDING'?'PENDING':'VOID';
}

function pnlFactor(exact){
  if(exact==='FULL_WIN')return 1;
  if(exact==='HALF_WIN')return .5;
  if(exact==='PUSH')return 0;
  if(exact==='HALF_LOSS')return -.5;
  if(exact==='FULL_LOSS')return -1;
  return null;
}

function netUnits(exact,odds){
  const d=num(odds);
  if(d===null||d<=0)return null;
  if(exact==='FULL_WIN')return Number((d-1).toFixed(6));
  if(exact==='HALF_WIN')return Number(((d-1)/2).toFixed(6));
  if(exact==='PUSH')return 0;
  if(exact==='HALF_LOSS')return -.5;
  if(exact==='FULL_LOSS')return -1;
  return null;
}

function fullMatchScore(record,away){
  const fh=num(record?.finalScore?.home),fa=num(record?.finalScore?.away);
  if(fh===null||fa===null||fh<0||fa<0)return null;
  return{
    selected:away?fa:fh,
    opponent:away?fh:fa,
    home:fh,
    away:fa,
    basis:'FULL_MATCH'
  };
}

function postEntryScore(record,away){
  const final=fullMatchScore(record,away);
  if(!final)return{ok:false,reason:'INVALID_FINAL_SCORE'};
  const eh=num(record?.entryScore?.home),ea=num(record?.entryScore?.away);
  if(eh===null||ea===null)return{ok:false,reason:'MISSING_ENTRY_SCORE'};
  if(eh<0||ea<0)return{ok:false,reason:'INVALID_ENTRY_SCORE'};
  const home=final.home-eh,awayGoals=final.away-ea;
  if(home<0||awayGoals<0)return{ok:false,reason:'ENTRY_SCORE_EXCEEDS_FINAL'};
  return{
    ok:true,
    selected:away?awayGoals:home,
    opponent:away?home:awayGoals,
    home,
    away:awayGoals,
    basis:'POST_ENTRY'
  };
}

export function selectedAhLine(record){
  const explicit=num(record?.selectedLine);
  if(explicit!==null)return explicit;

  const stored=num(record?.line);
  if(stored===null)return null;

  const perspective=String(record?.linePerspective||'HOME').toUpperCase();
  if(perspective==='SELECTED')return stored;

  // Goaloo presents one AH line between Home and Away.
  // Its public legend states "-" = gives handicap, "+" = receives handicap.
  // The stored legacy line therefore represents the HOME side; invert for AWAY.
  const away=String(record?.selectedSide||'HOME').toUpperCase()==='AWAY';
  return away?-stored:stored;
}

export function settleExact(record){
  if(!record?.settledAt||!record?.finalScore)return{exact:'PENDING',group:'PENDING',legs:[],basis:'PENDING',score:null,line:null,pnlFactor:null,netUnits:null};

  const away=String(record.selectedSide||'HOME').toUpperCase()==='AWAY';
  const full=fullMatchScore(record,away);
  if(!full)return{exact:'VOID',group:'VOID',legs:[],basis:'INVALID_FINAL_SCORE',score:null,line:null,pnlFactor:null,netUnits:null};

  if(record.market==='WIN'){
    const exact=full.selected>full.opponent?'FULL_WIN':'FULL_LOSS';
    return{
      exact,
      group:resultGroup(exact),
      legs:[{outcome:exact==='FULL_WIN'?'W':'L',margin:full.selected-full.opponent}],
      basis:'FULL_MATCH',
      score:{home:full.home,away:full.away},
      line:null,
      pnlFactor:pnlFactor(exact),
      netUnits:netUnits(exact,record.odds)
    };
  }

  if(record.market==='AH'){
    const selectedLine=selectedAhLine(record);
    const lines=splitQuarterLine(selectedLine);
    if(!lines.length)return{exact:'VOID',group:'VOID',legs:[],basis:'INVALID_LINE',score:null,line:selectedLine,pnlFactor:null,netUnits:null};

    // Bet365 In-Play Asian Handicap: goals before the bet are ignored.
    // No full-match fallback is allowed when Entry Score is missing because that
    // would silently apply a different market rule.
    const remainder=postEntryScore(record,away);
    if(!remainder.ok)return{exact:'VOID',group:'VOID',legs:[],basis:remainder.reason,score:null,line:selectedLine,pnlFactor:null,netUnits:null};

    const legs=lines.map(line=>({line,outcome:legResult(remainder.selected+line-remainder.opponent)}));
    const exact=combineLegs(legs.map(x=>x.outcome));
    return{
      exact,
      group:resultGroup(exact),
      legs,
      basis:'BET365_INPLAY_POST_ENTRY',
      score:{home:remainder.home,away:remainder.away},
      line:selectedLine,
      pnlFactor:pnlFactor(exact),
      netUnits:netUnits(exact,record.odds)
    };
  }

  if(record.market==='OU'){
    const lines=splitQuarterLine(record.line);
    if(!lines.length)return{exact:'VOID',group:'VOID',legs:[],basis:'INVALID_LINE',score:null,line:num(record.line),pnlFactor:null,netUnits:null};

    // Bet365 Goal Line In-Play counts all goals, including goals scored before the bet.
    const total=full.home+full.away,direction=String(record.ouDirection||'OVER').toUpperCase();
    const legs=lines.map(line=>({line,outcome:legResult(direction==='UNDER'?line-total:total-line)}));
    const exact=combineLegs(legs.map(x=>x.outcome));
    return{
      exact,
      group:resultGroup(exact),
      legs,
      basis:'BET365_GOAL_LINE_FULL_MATCH_TOTAL',
      score:{home:full.home,away:full.away},
      line:num(record.line),
      pnlFactor:pnlFactor(exact),
      netUnits:netUnits(exact,record.odds)
    };
  }

  return{exact:'VOID',group:'VOID',legs:[],basis:'UNSUPPORTED_MARKET',score:null,line:null,pnlFactor:null,netUnits:null};
}

function normalizeAhLine(record){
  if(record?.market!=='AH')return record;
  const selectedLine=selectedAhLine(record);
  const rawLine=num(record?.rawLine)??num(record?.line);
  if(selectedLine===null)return{...record,rawLine,linePerspective:'SELECTED',selectedLine:null};
  return{
    ...record,
    rawLine,
    line:selectedLine,
    selectedLine,
    linePerspective:'SELECTED'
  };
}

function normalizeRecord(input){
  const record=normalizeAhLine(input);
  if(!record?.settledAt||!record?.finalScore)return{
    ...record,
    resultGroup:'PENDING',
    settlementResult:'PENDING',
    settlement:'bet365_live_v4',
    settlementRule:'BET365 · Live AH=POST_ENTRY · Goal Line/O-U=FULL_MATCH_TOTAL · Quarter lines split stake 50/50'
  };

  const grade=settleExact(record);
  return{
    ...record,
    legacyResult:record.legacyResult||record.result||null,
    result:grade.group,
    resultGroup:grade.group,
    settlementResult:grade.exact,
    settlementLegs:grade.legs,
    settlementBasis:grade.basis,
    settlementScore:grade.score,
    settlementLine:grade.line,
    settlementPnlFactor:grade.pnlFactor,
    settlementNetUnits:grade.netUnits,
    settlement:'bet365_live_v4',
    settlementRule:'BET365 · Live AH=POST_ENTRY · Goal Line/O-U=FULL_MATCH_TOTAL · Quarter lines split stake 50/50'
  };
}

function summaryOf(records){
  const settled=records.filter(r=>r.settledAt&&r.resultGroup!=='PENDING');
  const win=settled.filter(r=>r.resultGroup==='WIN').length;
  const loss=settled.filter(r=>r.resultGroup==='LOSS').length;
  const draw=settled.filter(r=>r.resultGroup==='DRAW').length;
  const voids=settled.filter(r=>r.resultGroup==='VOID').length;
  const pending=records.filter(r=>!r.settledAt||r.resultGroup==='PENDING').length;
  const odds=settled.filter(r=>r.resultGroup!=='VOID').map(r=>num(r.odds)).filter(v=>v!==null&&v>0);
  const averageOdds=odds.length?odds.reduce((a,b)=>a+b,0)/odds.length:0;
  const winRate=win+loss?win/(win+loss)*100:0;
  const netUnitsTotal=settled.map(r=>num(r.settlementNetUnits)).filter(v=>v!==null).reduce((a,b)=>a+b,0);
  const exactCounts={
    fullWin:settled.filter(r=>r.settlementResult==='FULL_WIN').length,
    halfWin:settled.filter(r=>r.settlementResult==='HALF_WIN').length,
    push:settled.filter(r=>r.settlementResult==='PUSH').length,
    halfLoss:settled.filter(r=>r.settlementResult==='HALF_LOSS').length,
    fullLoss:settled.filter(r=>r.settlementResult==='FULL_LOSS').length
  };
  let cw=0,cl=0,cd=0;
  const trend=settled.filter(r=>r.resultGroup!=='VOID').sort((a,b)=>Date.parse(a.settledAt||a.selectedAt)-Date.parse(b.settledAt||b.selectedAt)).map((r,index)=>{
    if(r.resultGroup==='WIN')cw++;
    else if(r.resultGroup==='LOSS')cl++;
    else if(r.resultGroup==='DRAW')cd++;
    return{index:index+1,date:r.selectionDate||'',selectedAt:r.selectedAt||null,win:cw,loss:cl,draw:cd};
  });
  return{
    total:records.length,
    pending,
    settled:settled.length,
    win,
    loss,
    draw,
    void:voids,
    averageOdds:Number(averageOdds.toFixed(2)),
    winRate:Number(winRate.toFixed(2)),
    accuracy:Number(winRate.toFixed(2)),
    netUnits:Number(netUnitsTotal.toFixed(4)),
    exactSettlement:exactCounts,
    trend
  };
}

export class Car31State extends UpgradedCar31State{
  async scan(trigger='cron'){
    const response=await super.scan(trigger);
    try{
      const history=await this.state.storage.get('history')||[];
      const normalized=history.map(normalizeRecord);
      await this.state.storage.put('history',normalized);
      await this.state.storage.put('settlementContract',{
        version:'BET365_V4',
        reference:'BET365_FOOTBALL_RULES',
        settlement:'market_aware_live',
        asianHandicap:'post_entry_score',
        asianHandicapMissingEntryScore:'VOID',
        asianHandicapLinePerspective:'selected_team',
        quarterLines:'split_stake_50_50',
        win:'full_match_result',
        overUnder:'full_match_total',
        halfWin:'WIN',
        halfLoss:'LOSS',
        push:'DRAW',
        updatedAt:new Date().toISOString()
      });
    }catch(error){
      await this.state.storage.put('settlementContract',{version:'BET365_V4',status:'ERROR',error:String(error?.message||error),updatedAt:new Date().toISOString()});
    }
    return response;
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/history'){
      const stored=await this.state.storage.get('history')||[];
      const records=stored.map(normalizeRecord);
      const page=Math.max(1,Math.round(num(url.searchParams.get('page'))||1));
      const limit=Math.max(1,Math.min(100,Math.round(num(url.searchParams.get('limit'))||25)));
      const sorted=[...records].sort((a,b)=>Date.parse(b.selectedAt||0)-Date.parse(a.selectedAt||0));
      const offset=(page-1)*limit,pages=Math.max(1,Math.ceil(sorted.length/limit));
      return json({
        ok:true,
        generatedAt:new Date().toISOString(),
        settlementContract:'BET365_V4',
        settlement:'bet365_market_aware_live',
        page,limit,pages,total:sorted.length,offset,
        summary:summaryOf(records),
        records:sorted.slice(offset,offset+limit)
      });
    }
    if(request.method==='GET'&&url.pathname==='/health'){
      const response=await super.fetch(request),payload=await response.json().catch(()=>({ok:false}));
      const contract=await this.state.storage.get('settlementContract')||{version:'BET365_V4'};
      return json({...payload,settlementContract:contract.version||'BET365_V4',settlement:'bet365_market_aware_live'});
    }
    return super.fetch(request);
  }
}

export default upgradedWorker;
