import {processFullBoard} from './central-runtime.js';
import {settleAsianHandicap} from './settlement.js';

function ledgerRow(m){
  const s=m.signalLock;
  return {
    fixtureId:String(m.id),
    lockedAt:s.lockedAt,
    time:`${s.minute??m.minute??'—'}′`,
    match:`${m.home} — ${m.away}`,
    condition:`${m.passed}/${m.total}`,
    pick:String(s.selection||m.side||'home').toUpperCase(),
    ah:Number.isFinite(Number(s.line))?Number(s.line).toFixed(2):'—',
    odds:Number.isFinite(Number(s.odds))?Number(s.odds).toFixed(2):'—',
    source:s.bookmaker||s.oddsSource||'5USD',
    entry:`${s.entryScore?.home??0}–${s.entryScore?.away??0}`,
    final:'—',
    result:'PENDING',
    pl:'—',
    selection:s.selection||m.side||'home',
    line:s.line,
    rawOdds:s.odds,
    entryScore:s.entryScore
  };
}

export function processCentralCycle(payload,stateInput={},options={}){
  const {snapshot,state}=processFullBoard(payload,stateInput,options);
  const existing=new Map((state.ledger||[]).map(r=>[String(r.fixtureId),r]));
  for(const m of snapshot.matches){
    if(m.signalLock&&!existing.has(String(m.id))){
      const row=ledgerRow(m);
      state.ledger.push(row);
      existing.set(String(m.id),row);
    }
  }
  for(const m of snapshot.matches){
    const row=existing.get(String(m.id));
    if(!row||row.result!=='PENDING'||String(m.status).toLowerCase()!=='finished')continue;
    const settled=settleAsianHandicap({selection:row.selection,line:row.line,odds:row.rawOdds,entryScore:row.entryScore,finalScore:m.score});
    row.final=`${m.score.home}–${m.score.away}`;
    row.result=settled.result;
    row.pl=settled.units==null?'—':`${settled.units>=0?'+':''}${settled.units.toFixed(2)}`;
    row.settledAt=options.observedAt||new Date().toISOString();
  }
  snapshot.ledger=state.ledger;
  const pending=state.ledger.filter(r=>r.result==='PENDING').length;
  snapshot.health.sources=[...(snapshot.health.sources||[]),{name:'Settlement ledger',state:`${pending} PENDING`}];
  state.lastGoodSnapshot=snapshot;
  return {snapshot,state};
}
