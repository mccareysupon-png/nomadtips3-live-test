import {FIVEUSD_REFEREES} from './fivedollar.js';

export const FIVEUSD_REFEREE_FLOW_VERSION='341-5usd-referee-flow-v1';
const DEFAULT_HISTORY_LIMIT=24;
const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value));
const num=value=>finite(value)?Number(value):null;
const text=value=>value===null||value===undefined?null:String(value);

function validReady(row){
  return row?.status==='AH READY'&&num(row?.line)!==null&&num(row?.homeOdds)!==null&&num(row?.awayOdds)!==null;
}

function fingerprint(row){
  if(!validReady(row)) return null;
  return text(row?.priceFingerprint)||`${num(row.line)}|${num(row.homeOdds)}|${num(row.awayOdds)}`;
}

function currentView(definition,row){
  const ready=validReady(row);
  return {
    sourceId:definition.sourceId,
    position:definition.position,
    bookmaker:definition.bookmaker,
    status:text(row?.status)||'AH UNAVAILABLE',
    ready,
    homeAhLine:ready?num(row.line):null,
    awayAhLine:ready?num(row.awayLine)??-num(row.line):null,
    homeOdds:ready?num(row.homeOdds):null,
    awayOdds:ready?num(row.awayOdds):null,
    observedAt:num(row?.observedAt),
    lastSeenAt:num(row?.lastSeenAt),
    lastChangedAt:num(row?.lastChangedAt),
    priceFingerprint:ready?fingerprint(row):null,
    freshnessBasis:'OBSERVED',
    sourceUpdatedAt:null,
  };
}

function eventFromCurrent(current){
  if(!current?.ready||!current.priceFingerprint) return null;
  return {
    observedAt:current.observedAt,
    lastChangedAt:current.lastChangedAt,
    homeAhLine:current.homeAhLine,
    awayAhLine:current.awayAhLine,
    homeOdds:current.homeOdds,
    awayOdds:current.awayOdds,
    priceFingerprint:current.priceFingerprint,
  };
}

export function appendFiveUsdRefereeFlow(previousFlow,snapshot,at=Date.now(),{historyLimit=DEFAULT_HISTORY_LIMIT}={}){
  const fixtureId=String(snapshot?.fixtureId??previousFlow?.fixtureId??'').trim();
  if(!fixtureId) throw new Error('FIVEUSD_FIXTURE_ID_MISSING');
  const previousRows=new Map((previousFlow?.rows||[]).map(row=>[row.sourceId,row]));
  const snapshotRows=new Map((snapshot?.referees||[]).map(row=>[row.sourceId,row]));
  const limit=Math.max(2,Math.min(100,Math.round(Number(historyLimit)||DEFAULT_HISTORY_LIMIT)));

  const rows=FIVEUSD_REFEREES.map(definition=>{
    const previous=previousRows.get(definition.sourceId)||null;
    const source=snapshotRows.get(definition.sourceId)||null;
    const current=currentView(definition,source);
    const history=Array.isArray(previous?.history)?previous.history.slice(-limit):[];
    const event=eventFromCurrent(current);
    const last=history.at(-1)||null;
    if(event&&event.priceFingerprint!==last?.priceFingerprint) history.push(event);
    return {
      sourceId:definition.sourceId,
      position:definition.position,
      bookmaker:definition.bookmaker,
      current,
      history:history.slice(-limit),
      changes:Math.max(0,history.length-1),
    };
  });

  return {
    version:FIVEUSD_REFEREE_FLOW_VERSION,
    fixtureId,
    source:'5DollarFootballAPI',
    sourceOfTruth:true,
    market:'FULL MATCH LIVE AH',
    presentationOnly:true,
    updatedAt:Number(at)||Date.now(),
    rows,
  };
}

export function summarizeFiveUsdRefereeFlow(flow){
  const rows=Array.isArray(flow?.rows)?flow.rows:[];
  return {
    fixtureId:flow?.fixtureId??null,
    bookmakerPanel:rows.length,
    ready:rows.filter(row=>row?.current?.ready===true).length,
    withHistory:rows.filter(row=>Array.isArray(row?.history)&&row.history.length>0).length,
    changes:rows.reduce((sum,row)=>sum+Number(row?.changes||0),0),
  };
}
