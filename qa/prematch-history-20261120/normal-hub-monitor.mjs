// Read-only normalization of the existing NOMAD LIVE 3.43 HUB cache.
// Preserve the immutable pick kickoff separately from the most recent HUB schedule.
// Never infer LIVE/POSTPONED/CANCELLED just because a kickoff has passed.
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const score=n=>Number.isSafeInteger(n)&&n>=0;
const epoch=s=>{const n=Number(s);if(Number.isFinite(n)&&n>1e12)return Math.floor(n/1000);if(Number.isSafeInteger(n)&&n>1e9&&n<1e11)return n;const t=Date.parse(s);return Number.isFinite(t)?Math.floor(t/1000):0};
const scheduleStatus=(status,code)=>{
 if(status==='postponed'||code==='pst')return 'POSTPONED';
 if(status==='cancelled'||status==='canceled'||code==='canc')return 'CANCELLED';
 if(status==='abandoned'||code==='abd')return 'ABANDONED';
 if(status==='unknown'||code==='unknown')return 'UNKNOWN';
 return null;
};
export function matchNormalHub(snapshot,ledgerRows,now){
 if(snapshot?.ok!==true||snapshot?.cacheOnly!==true||!Array.isArray(snapshot.fixtures)||!Number.isSafeInteger(now))throw Error('INVALID_CACHE_ONLY_HUB_SNAPSHOT');
 const observed=epoch(snapshot.fetchedAt);
 if(observed<=0||observed>now+60)throw Error('INVALID_HUB_OBSERVATION');
 const byId=new Map(snapshot.fixtures.filter(x=>positive(x?.fixtureId)).map(x=>[String(x.fixtureId),x]));
 const monitor={},finals=[],details={matches:0,live:0,finished:0,absent:0,mismatch:0,rescheduled:0,postponed:0,cancelled:0,abandoned:0,unknown:0};
 for(const p of ledgerRows){
  const key=String(p.fixture_id),f=byId.get(key),lockedKickoff=Number(p.kickoff);
  if(!f){details.absent++;monitor[key]={phase:'NOT_IN_HUB',label:'Schedule unverified',observed,lockedKickoff};continue}
  const kickoff=epoch(f.kickoffUtc||f.kickoffAt),home=Number(f.home?.id),away=Number(f.away?.id);
  // Fixture and both teams establish identity; a changed kickoff is a revision,
  // not a different match. A missing/invalid kickoff cannot be adopted.
  if(!positive(kickoff)||home!==Number(p.home_id)||away!==Number(p.away_id)){
   details.mismatch++;monitor[key]={phase:'IDENTITY_MISMATCH',label:'Fixture identity requires review',observed,lockedKickoff};continue
  }
  details.matches++;
  const scheduleChanged=kickoff!==lockedKickoff;
  if(scheduleChanged)details.rescheduled++;
  const code=String(f.statusCode??'').toLowerCase(),status=String(f.status??'').toLowerCase(),board=String(f.boardState??'').toLowerCase();
  const validScore=score(f.goals?.home)&&score(f.goals?.away);
  const isFinished=status==='finished'&&board==='finished'&&code==='full';
  const isLive=board==='live'||status==='in_play'||status==='live';
  const special=scheduleStatus(status,code);
  let phase='PENDING',label='Scheduled';
  if(special){phase=special;label=special;details[special.toLowerCase()]++}
  else if(isFinished){phase='FINISHED';label='FT';details.finished++}
  else if(isLive){phase='LIVE';label=code==='half'?'HT':Number.isInteger(Number(f.minute))&&f.minute!==null&&String(f.minute).trim()!==''&&Number(f.minute)>=0&&Number(f.minute)<=150?Number(f.minute)+"'":'LIVE';details.live++}
  monitor[key]={
   phase,label,minute:phase==='LIVE'&&Number.isFinite(Number(f.minute))&&f.minute!=null?Number(f.minute):null,
   score:validScore&&(phase==='LIVE'||phase==='FINISHED')?{home:f.goals.home,away:f.goals.away}:null,
   observed,hubStatus:status,hubStatusCode:code,lockedKickoff,
   // Existing read-only cached league metadata; verified fixture ID + both team IDs above.
   leagueName:typeof f.league?.name==='string'&&f.league.name.trim()?f.league.name.trim():null,
   scheduledKickoff:kickoff,scheduleChanged,scheduleObservedAt:observed
  };
  // Settle only authoritative FULL time; no automatic settlement for delays,
  // cancellation, incomplete games, missing HUB IDs, or predictions made after
  // a newly revised kickoff. The original locked kickoff is never rewritten.
  if(p.status==='PENDING'&&phase==='FINISHED'&&validScore&&
     Number(p.picked_at)<kickoff&&observed>kickoff&&positive(f.league?.id)){
   finals.push({id:Number(p.fixture_id),league:{id:Number(f.league.id)},kickoff_ts:kickoff,
      teams:{home:{id:home},away:{id:away}},status:'finished',status_code:'full',
      goals:{home:f.goals.home,away:f.goals.away}});
  }
 }
 return {observed,monitor,finals,details,source:'NOMAD_343_HUB_CACHED_SNAPSHOT',cacheOnly:true,providerCalls:0,snapshotStale:!!snapshot.stale}
}
