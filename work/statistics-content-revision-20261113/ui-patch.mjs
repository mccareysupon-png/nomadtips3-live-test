import assert from 'node:assert/strict';
import {connectExistingUi as base} from '../statistics-summary-shadow-20261113/ui-patch.mjs';
export function connectExistingUi(input){
 const p=base(input);let w=p.workspace;const changes=[];
 function one(a,b,name){assert.equal(w.split(a).length,2,'CONTENT_UI_DRIFT:'+name);w=w.replace(a,()=>b);changes.push(name)}
 one("const API = '/api/engine/statistics';","const API = '/api/statistics/history';",'Use independent immutable history service');
 one('data.halfWin, data.halfLoss, data.ledgerUpdatedAt','data.halfWin, data.halfLoss, data.statisticsContentRevision, data.statisticsSnapshotId','Page identity is content and immutable snapshot, never freshness');
 one("if(cached&&Date.now()-loadedAt<CACHE_MS)return cached;",`if(cached&&Date.now()-loadedAt<CACHE_MS)return cached;
 if(cached){try{const small=await loadSummary();if(small&&Number.isSafeInteger(small.contentRevision)&&small.contentRevision===cached.statisticsContentRevision){loadedAt=Date.now();return cached}}catch{}}`, 'No-op summary reuses complete history without dispatch/render');
 one("if(response.status===409&&data?.error==='STATISTICS_GENERATION_CHANGED')","if((response.status===409&&data?.error==='STATISTICS_GENERATION_CHANGED')||(response.status===410&&data?.error==='STATISTICS_SNAPSHOT_EXPIRED'))",'Bounded restart for expired snapshot');
 one("if(ticket!==state.statsRequest||state.view!=='statistics')return;state.rows=","if(ticket!==state.statsRequest||state.view!=='statistics')return;if(state.statsLoaded&&state.rows===(j.ledgerRows||j.rows)){state.statsLoadedAt=Date.now();return}state.rows=",'No redundant Statistics DOM work after identical dataset');
 one("getSnapshotAt:()=>cached?.preview?Number(cached.ledgerUpdatedAt):loadedAt","getSnapshotAt:()=>cached?Number(cached.statisticsSnapshotAsOf??cached.ledgerUpdatedAt):0",'Keep source age separate from browser read time');
 return {...p,workspace:w,changes:[...p.changes,...changes]};
}
