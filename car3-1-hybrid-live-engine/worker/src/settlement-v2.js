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
const HISTORY_RANGES={
  '30D':30,
  '90D':90,
  '6M':183,
  '1Y':365,
  '3Y':1096,
  'ALL':null
};

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

function archiveKey(record){
  return String(record?.key||`${record?.id||'match'}:${record?.selectedAt||record?.selectionDate||'unknown'}:${record?.market||'market'}`);
}

function historyRange(value){
  const v=String(value||'ALL').toUpperCase();
  return Object.prototype.hasOwnProperty.call(HISTORY_RANGES,v)?v:'ALL';
}

function cutoffForRange(range){
  const days=HISTORY_RANGES[range];
  return days===null?null:new Date(Date.now()-days*86400000).toISOString();
}

function ensureArchiveSchema(state){
  const sql=state?.storage?.sql;
  if(!sql)return null;
  sql.exec(`
    CREATE TABLE IF NOT EXISTS history_archive_v1 (
      record_key TEXT PRIMARY KEY,
      selected_at TEXT NOT NULL,
      selection_date TEXT,
      settled_at TEXT,
      result_group TEXT NOT NULL,
      settlement_result TEXT,
      market TEXT,
      odds REAL,
      net_units REAL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_archive_v1_selected_at ON history_archive_v1(selected_at);
    CREATE INDEX IF NOT EXISTS idx_history_archive_v1_selection_date ON history_archive_v1(selection_date);
    CREATE INDEX IF NOT EXISTS idx_history_archive_v1_result_group ON history_archive_v1(result_group);
  `);
  return sql;
}

function archiveRecords(state,records){
  const sql=ensureArchiveSchema(state);
  if(!sql)return{ok:false,count:0,reason:'SQL_STORAGE_UNAVAILABLE'};
  let count=0;
  for(const record of records){
    if(!record?.selectedAt)continue;
    const payload=JSON.stringify(record);
    sql.exec(`
      INSERT INTO history_archive_v1
        (record_key,selected_at,selection_date,settled_at,result_group,settlement_result,market,odds,net_units,payload)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(record_key) DO UPDATE SET
        selected_at=excluded.selected_at,
        selection_date=excluded.selection_date,
        settled_at=excluded.settled_at,
        result_group=excluded.result_group,
        settlement_result=excluded.settlement_result,
        market=excluded.market,
        odds=excluded.odds,
        net_units=excluded.net_units,
        payload=excluded.payload
      WHERE history_archive_v1.payload<>excluded.payload
    `,
      archiveKey(record),record.selectedAt,record.selectionDate||null,record.settledAt||null,
      record.resultGroup||'PENDING',record.settlementResult||'PENDING',record.market||null,
      num(record.odds),num(record.settlementNetUnits),payload
    );
    count++;
  }
  return{ok:true,count};
}

function sqlHistory(state,{range,page,limit}){
  const sql=ensureArchiveSchema(state);
  if(!sql)return null;
  const cutoff=cutoffForRange(range);
  const where=cutoff?'WHERE selected_at>=?':'';
  const params=cutoff?[cutoff]:[];
  const totalRow=sql.exec(`SELECT COUNT(*) AS n FROM history_archive_v1 ${where}`,...params).one();
  const total=Number(totalRow?.n||0),offset=(page-1)*limit,pages=Math.max(1,Math.ceil(total/limit));
  const pageRows=sql.exec(`SELECT payload FROM history_archive_v1 ${where} ORDER BY selected_at DESC LIMIT ? OFFSET ?`,...params,limit,offset).toArray();
  const records=pageRows.map(row=>{try{return JSON.parse(row.payload);}catch{return null;}}).filter(Boolean);
  const settledWhere=cutoff?`WHERE selected_at>=? AND result_group<>'PENDING'`:`WHERE result_group<>'PENDING'`;
  const settledParams=cutoff?[cutoff]:[];
  const summaryRow=sql.exec(`
    SELECT
      COUNT(*) AS settled,
      SUM(CASE WHEN result_group='WIN' THEN 1 ELSE 0 END) AS win,
      SUM(CASE WHEN result_group='LOSS' THEN 1 ELSE 0 END) AS loss,
      SUM(CASE WHEN result_group='DRAW' THEN 1 ELSE 0 END) AS draw,
      SUM(CASE WHEN result_group='VOID' THEN 1 ELSE 0 END) AS void_count,
      AVG(CASE WHEN result_group<>'VOID' AND odds>0 THEN odds END) AS average_odds,
      SUM(CASE WHEN net_units IS NOT NULL THEN net_units ELSE 0 END) AS net_units,
      SUM(CASE WHEN settlement_result='FULL_WIN' THEN 1 ELSE 0 END) AS full_win,
      SUM(CASE WHEN settlement_result='HALF_WIN' THEN 1 ELSE 0 END) AS half_win,
      SUM(CASE WHEN settlement_result='PUSH' THEN 1 ELSE 0 END) AS push,
      SUM(CASE WHEN settlement_result='HALF_LOSS' THEN 1 ELSE 0 END) AS half_loss,
      SUM(CASE WHEN settlement_result='FULL_LOSS' THEN 1 ELSE 0 END) AS full_loss
    FROM history_archive_v1 ${settledWhere}
  `,...settledParams).one();
  const pendingWhere=cutoff?'WHERE selected_at>=? AND result_group=\'PENDING\'':'WHERE result_group=\'PENDING\'';
  const pending=Number(sql.exec(`SELECT COUNT(*) AS n FROM history_archive_v1 ${pendingWhere}`,...params).one()?.n||0);
  const win=Number(summaryRow?.win||0),loss=Number(summaryRow?.loss||0),draw=Number(summaryRow?.draw||0),settled=Number(summaryRow?.settled||0);
  const trendWhere=cutoff?`WHERE selected_at>=? AND result_group NOT IN ('PENDING','VOID')`:`WHERE result_group NOT IN ('PENDING','VOID')`;
  const daily=sql.exec(`
    SELECT selection_date AS date,
      SUM(CASE WHEN result_group='WIN' THEN 1 ELSE 0 END) AS win,
      SUM(CASE WHEN result_group='LOSS' THEN 1 ELSE 0 END) AS loss,
      SUM(CASE WHEN result_group='DRAW' THEN 1 ELSE 0 END) AS draw
    FROM history_archive_v1
    ${trendWhere}
    GROUP BY selection_date
    ORDER BY selection_date ASC
  `,...params).toArray();
  let cw=0,cl=0,cd=0,index=0;
  const trend=daily.map(row=>{
    cw+=Number(row.win||0);cl+=Number(row.loss||0);cd+=Number(row.draw||0);index+=Number(row.win||0)+Number(row.loss||0)+Number(row.draw||0);
    return{index,date:row.date||'',win:cw,loss:cl,draw:cd};
  });
  const archiveTotal=Number(sql.exec('SELECT COUNT(*) AS n FROM history_archive_v1').one()?.n||0);
  return{
    total,page,limit,pages,offset,records,archiveTotal,
    summary:{
      total,
      pending,
      settled,
      win,loss,draw,
      void:Number(summaryRow?.void_count||0),
      averageOdds:Number(Number(summaryRow?.average_odds||0).toFixed(2)),
      winRate:Number((win+loss?win/(win+loss)*100:0).toFixed(2)),
      accuracy:Number((win+loss?win/(win+loss)*100:0).toFixed(2)),
      netUnits:Number(Number(summaryRow?.net_units||0).toFixed(4)),
      exactSettlement:{
        fullWin:Number(summaryRow?.full_win||0),
        halfWin:Number(summaryRow?.half_win||0),
        push:Number(summaryRow?.push||0),
        halfLoss:Number(summaryRow?.half_loss||0),
        fullLoss:Number(summaryRow?.full_loss||0)
      },
      trend
    }
  };
}

export class Car31State extends UpgradedCar31State{
  async scan(trigger='cron'){
    const response=await super.scan(trigger);
    try{
      const history=await this.state.storage.get('history')||[];
      const normalized=history.map(normalizeRecord);
      await this.state.storage.put('history',normalized);

      const backfilled=await this.state.storage.get('historyArchiveV1Backfilled');
      if(!backfilled){
        archiveRecords(this.state,normalized);
        await this.state.storage.put('historyArchiveV1Backfilled',{at:new Date().toISOString(),workingSetCount:normalized.length});
      }else{
        const sixHoursAgo=Date.now()-6*60*60*1000;
        const hot=normalized.filter(r=>!r.settledAt||Date.parse(r.selectedAt||0)>=sixHoursAgo);
        const latest=normalized.slice(-20);
        const dedup=new Map([...hot,...latest].map(r=>[archiveKey(r),r]));
        archiveRecords(this.state,[...dedup.values()]);
      }

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
        historyArchive:'SQLITE_HISTORY_ARCHIVE_V1',
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
      const range=historyRange(url.searchParams.get('range'));

      try{
        const backfilled=await this.state.storage.get('historyArchiveV1Backfilled');
        if(!backfilled){
          archiveRecords(this.state,records);
          await this.state.storage.put('historyArchiveV1Backfilled',{at:new Date().toISOString(),workingSetCount:records.length});
        }
        const archived=sqlHistory(this.state,{range,page,limit});
        if(archived){
          return json({
            ok:true,
            generatedAt:new Date().toISOString(),
            settlementContract:'BET365_V4',
            settlement:'bet365_market_aware_live',
            historyStorage:'SQLITE_HISTORY_ARCHIVE_V1',
            range,
            ...archived
          });
        }
      }catch(error){
        console.warn('SQLite history archive fallback',String(error?.message||error));
      }

      const cutoff=cutoffForRange(range);
      const filtered=cutoff?records.filter(r=>Date.parse(r.selectedAt||0)>=Date.parse(cutoff)):records;
      const sorted=[...filtered].sort((a,b)=>Date.parse(b.selectedAt||0)-Date.parse(a.selectedAt||0));
      const offset=(page-1)*limit,pages=Math.max(1,Math.ceil(sorted.length/limit));
      return json({
        ok:true,
        generatedAt:new Date().toISOString(),
        settlementContract:'BET365_V4',
        settlement:'bet365_market_aware_live',
        historyStorage:'WORKING_SET_FALLBACK',
        range,
        page,limit,pages,total:sorted.length,offset,
        summary:summaryOf(filtered),
        records:sorted.slice(offset,offset+limit)
      });
    }
    if(request.method==='GET'&&url.pathname==='/health'){
      const response=await super.fetch(request),payload=await response.json().catch(()=>({ok:false}));
      const contract=await this.state.storage.get('settlementContract')||{version:'BET365_V4'};
      let archiveTotal=null;
      try{const sql=ensureArchiveSchema(this.state);archiveTotal=sql?Number(sql.exec('SELECT COUNT(*) AS n FROM history_archive_v1').one()?.n||0):null;}catch{}
      return json({...payload,settlementContract:contract.version||'BET365_V4',settlement:'bet365_market_aware_live',historyStorage:'SQLITE_HISTORY_ARCHIVE_V1',historyArchiveTotal:archiveTotal});
    }
    return super.fetch(request);
  }
}

export default upgradedWorker;
