// Step 7: one explicit page per call. No fetch, timers, or independent credentials.
// The supplied transport must be separately approved and quota-controlled.
import {executeJohnStep,registerCatalogCurrent} from './john-sync.mjs';
import {processLeaguePage} from './backfill.mjs';
import {totals} from './history.mjs';
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
export async function step7(db,{now,leagueIds,transport,approved=false}={}){
 if(approved!==true||typeof transport!=='function')return {state:'BLOCKED_NO_APPROVED_TRANSPORT',requests:0,stored:totals(db)};
 if(!Number.isSafeInteger(now)||!Array.isArray(leagueIds)||!leagueIds.length||leagueIds.some(x=>!Number.isSafeInteger(x)||x<=0))throw Error('INVALID_SCOPE');
 const catalog=rows(db,"SELECT * FROM john_tasks WHERE kind='catalog' ORDER BY task_key");
 if(catalog.length!==1)return {state:'BLOCKED_CATALOG_SCOPE',requests:0,stored:totals(db)};
 const t=catalog[0];
 if(t.state!=='complete'){
  const r=await executeJohnStep(db,{key:t.task_key,now,centralGateway:transport});
  return {...r,kind:'catalog',stored:totals(db)};
 }
 const scopes=registerCatalogCurrent(db,leagueIds,now);
 const allowed=new Set(leagueIds);
 const queue=rows(db,'SELECT * FROM league_seed_v2 ORDER BY league_id,scope').filter(r=>allowed.has(r.league_id));
 const next=queue.find(r=>['pending','retry'].includes(r.state)&&r.not_before<=now);
 if(!next)return {state:scopes.missing||scopes.noSeason||queue.some(r=>r.state!=='complete')?'BLOCKED_OR_INCOMPLETE':'SEED_COMPLETE',requests:0,scopes,stored:totals(db)};
 const r=await processLeaguePage(db,{scope:next.scope,league:next.league_id,now,centralGateway:transport});
 return {...r,kind:'seed',league:next.league_id,scope:next.scope,stored:totals(db)};
}
