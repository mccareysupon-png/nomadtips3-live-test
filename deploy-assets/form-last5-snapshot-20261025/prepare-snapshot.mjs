import {buildLast5Snapshot} from './snapshot-core.mjs';

/**
 * Strict offline build step to be called from the existing scheduled board refresh.
 * Does not perform fetch(). The caller supplies authoritative board fixtures and durable FT records.
 * Do not publish unless required fields were verified at ingestion.
 */
export function prepareSnapshot({board,finished,revision,now=Date.now()}){
 if(!board||!Array.isArray(board.fixtures)||!Array.isArray(finished)||typeof revision!=='string'||!revision.trim())throw Error('MISSING_AUTHORITATIVE_INPUT');
 const snap=buildLast5Snapshot(board.fixtures,finished,new Date(now).toISOString());
 const total=Object.keys(snap.fixtures).length;
 let full=0,partial=0,missing=0;
 for(const x of Object.values(snap.fixtures)){if(x.home.count===5&&x.away.count===5)full++;else if(x.home.count===0||x.away.count===0)missing++;else partial++;}
 return {revision,boardGeneratedAt:board.generatedAt??null,quality:{fixtures:total,full,partial,missing,coverage:total?full/total:0},snapshot:snap};
}
export function publishGate(prepared,{minimumCoverage=0.95}={}){
 if(!prepared||!Number.isFinite(prepared.quality?.coverage))throw Error('INVALID_PREPARED_SNAPSHOT');
 if(prepared.quality.fixtures===0)throw Error('NO_FIXTURES');
 if(prepared.quality.coverage<minimumCoverage)throw Error('INSUFFICIENT_FT_COVERAGE');
 return prepared;
}
