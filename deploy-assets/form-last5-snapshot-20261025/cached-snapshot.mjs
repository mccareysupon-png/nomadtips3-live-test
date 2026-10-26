import {prepareSnapshot} from './prepare-snapshot.mjs';

// Offline adapter only. Caller supplies already-read private HistoryGate cache entries.
// Never invokes HistoryGate.read(): a cold read there can call the provider.
export function prepareCachedSnapshot({board,revision,entries,now=Date.now()}){
 if(!board||board.ok!==true||board.stale===true||!Array.isArray(board.fixtures))throw Error('BOARD_UNAVAILABLE');
 if(!Array.isArray(entries)||!Number.isFinite(now))throw Error('INVALID_CACHE_INPUT');
 const finished=[],seen=new Set();
 let accepted=0,rejected=0;
 for(const fixture of board.fixtures){
  const cutoff=Date.parse(fixture.kickoffUtc||'');
  for(const side of ['home','away']){
   const teamId=String(fixture[side]?.id??'');
   const key=teamId+':'+cutoff;
   if(seen.has(key))continue;
   seen.add(key);
   const candidates=entries.filter(e=>{
    const d=e?.data;
    return Number.isFinite(e?.expires)&&e.expires>now&&d?.source==='5USD'&&d.verified===true&&
     String(d.teamId)===teamId&&Date.parse(d.cutoffUtc)===cutoff&&
     Number.isFinite(Date.parse(d.fetchedAt))&&Date.parse(d.fetchedAt)<=now&&
     Array.isArray(d.rows)&&d.count===d.rows.length&&d.rows.length<=5&&
     d.rows.every(r=>r?.status==='FT'&&[String(r.home?.id),String(r.away?.id)].includes(teamId)&&
      String(r.fixtureId)!==String(fixture.fixtureId)&&Date.parse(r.kickoffUtc)<cutoff&&Date.parse(r.kickoffUtc)<=now);
   });
   if(!candidates.length){rejected++;continue;}
   accepted++;
   for(const e of candidates)finished.push(...e.data.rows);
  }
 }
 const prepared=prepareSnapshot({board,finished,revision,now});
 return {...prepared,cacheInput:{acceptedTeamCutoffs:accepted,missingTeamCutoffs:rejected,providerRequests:0}};
}
