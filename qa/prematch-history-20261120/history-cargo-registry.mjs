// BALL46 History Cargo Registry (HCR V1) - TEST ONLY.
import {ouTargetLastMatches,ouTargetHistoryCoverage} from './ou-target-history-ft-v1-test.mjs';
// Exactly one lightweight JSON array of newly imported fixture IDs per history
// round. Every detail is resolved from the canonical SQLite result_version on
// an authenticated administrative GET, never copied during data intake.
// No provider calls, no new cron, no changes to prediction ledger.
export const HCR_NAME='BALL46 History Cargo Registry';
export const HCR_CODE='HCR-V1';
const sql=(db,q,...args)=>Array.from(db.exec(q,...args));
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const dateKey=x=>/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(x??''));
export function initHistoryCargoRegistry(db){
 db.exec("CREATE TABLE IF NOT EXISTS prematch_history_cargo_manifest (business_day TEXT NOT NULL,round_no INTEGER NOT NULL,created_at INTEGER NOT NULL,source TEXT NOT NULL,fixture_ids_json TEXT NOT NULL,imported INTEGER NOT NULL,schema_version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(business_day,round_no))");
}
export function writeHistoryCargoManifest(db,{businessDay,roundNo,now,selected,imported}){
 if(!dateKey(businessDay)||!Number.isInteger(roundNo)||roundNo<1||roundNo>5||
   !Number.isSafeInteger(now)||now<=0||!Array.isArray(selected)||
   selected.length>100||!Number.isInteger(imported)||imported!==selected.length)throw Error('HCR_INVALID_ROUND_MANIFEST');
 const ids=selected.map(x=>Number(x.id));
 if(ids.some(x=>!positive(x))||new Set(ids).size!==ids.length)throw Error('HCR_DUPLICATE_OR_INVALID_FIXTURE');
 const inserted=sql(db,"INSERT INTO prematch_history_cargo_manifest (business_day,round_no,created_at,source,fixture_ids_json,imported,schema_version) VALUES(?,?,?,?,?,?,1) ON CONFLICT DO NOTHING",businessDay,roundNo,now,'NORMAL_HUB_CACHED_FINISHED',JSON.stringify(ids),imported);
 // The write is called within an existing transaction; fail closed on conflicts.
 const change=Number(sql(db,'SELECT changes() AS n')[0]?.n??0);
 if(change!==1)throw Error('HCR_DUPLICATE_MANIFEST');
 return {businessDay,roundNo,imported,fixtureIds:ids};
}
function latestFinished(db,now){
 return sql(db,"SELECT r.fixture_id,r.league_id,r.home_id,r.away_id,r.kickoff,r.observed,r.hg,r.ag FROM result_version r WHERE r.status='finished' AND r.observed<=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?)",now,now);
}
export function historyCargoReport(db,now,{day=null,includeItems=true,upcoming=[]}={}){
 if(!Number.isSafeInteger(now)||now<=0||!(day===null||dateKey(day)))throw Error('HCR_INVALID_REPORT_QUERY');
 initHistoryCargoRegistry(db);
 const roundQuery='SELECT business_day,round_no,attempted_at,source,state,imported,received,provider_calls FROM prematch_history_rounds';
 const rounds=day!==null
   ?sql(db,roundQuery+' WHERE business_day=? ORDER BY round_no ASC',day)
   :sql(db,roundQuery+' ORDER BY business_day DESC,round_no ASC LIMIT 70');
 const manifests=day!==null
   ?sql(db,'SELECT * FROM prematch_history_cargo_manifest WHERE business_day=?',day)
   :sql(db,'SELECT * FROM prematch_history_cargo_manifest ORDER BY business_day DESC,round_no ASC LIMIT 70');
 const manifestByKey=new Map(manifests.map(m=>[m.business_day+':'+m.round_no,m]));
 // Read the archive ONCE per admin report. This is never on the main webpage path.
 const archived=latestFinished(db,now),byId=new Map(archived.map(x=>[Number(x.fixture_id),x]));
 let verified=0,legacy=0,review=0,missingArchive=0;
 const records=rounds.map(r=>{
   const m=manifestByKey.get(r.business_day+':'+r.round_no),state=m
     ?(m.schema_version===1&&m.imported===r.imported?'TRACKED':'REVIEW_REQUIRED')
     :r.state==='COMPLETED'?'LEGACY_UNTRACKED':'REVIEW_REQUIRED';
   if(state==='TRACKED')verified++;else if(state==='LEGACY_UNTRACKED')legacy++;else review++;
   let ids=[];
   if(m){try{ids=JSON.parse(m.fixture_ids_json)}catch{ids=[]}}
   if(!Array.isArray(ids)||ids.length!==Number(r.imported)||new Set(ids).size!==ids.length)ids=[];
   const items=state==='TRACKED'&&includeItems?ids.map(id=>{
     const x=byId.get(Number(id));
     if(!x){missingArchive++;return {fixtureId:id,archiveStatus:'MISSING_OR_NON_FINISHED'}}
     return {fixtureId:id,leagueId:x.league_id,homeTeamId:x.home_id,awayTeamId:x.away_id,
       kickoffUTC:new Date(Number(x.kickoff)*1000).toISOString(),homeGoals:x.hg,awayGoals:x.ag,archiveStatus:'FINISHED'};
   }):[];
   return {businessDay:r.business_day,roundNo:r.round_no,attemptedAt:r.attempted_at,
     source:r.source,state:r.state,received:r.received,imported:r.imported,providerCalls:r.provider_calls,
     manifestStatus:state,fixtureIds:state==='TRACKED'?ids:null,...(includeItems?{items}:{}),
     ...(state==='LEGACY_UNTRACKED'?{note:'Pre-HCR historical IDs cannot be attributed to a specific trip reliably'}:{})};
 });
 const pendingStates=new Set(['scheduled','upcoming','waiting']);
 const upcomingRows=(Array.isArray(upcoming)?upcoming:[]).filter(x=>pendingStates.has(String(x?.status??'').toLowerCase())&&positive(x?.id)&&Number.isSafeInteger(x.kickoff_ts)&&x.kickoff_ts>now);
  const coverage=upcomingRows.map(f=>{
   const kickoff=f.kickoff_ts;
   const sides=['home','away'].map(side=>{
     const team=f.teams?.[side]||{},teamId=Number(team.id);
     const available=positive(teamId)?ouTargetLastMatches(db,teamId,kickoff,now,10).length:0;
     return {side,teamId,teamName:String(team.name||teamId),historyMatches:available,
      missingTo3:Math.max(0,3-available),missingTo10:Math.max(0,10-available)};
   });
   return {fixtureId:Number(f.id),kickoffUTC:new Date(kickoff*1000).toISOString(),
      home:sides[0],away:sides[1],completeFor3:sides.every(s=>s.missingTo3===0),completeFor10:sides.every(s=>s.missingTo10===0),
      totalTeamMatchGaps:sides[0].missingTo3+sides[1].missingTo3,
      totalTeamMatchGapsTo10:sides[0].missingTo10+sides[1].missingTo10,
      leagueId:positive(f.league?.id)?Number(f.league.id):null,
      leagueName:String(f.league?.name||'')||null};
 }).sort((a,b)=>b.totalTeamMatchGaps-a.totalTeamMatchGaps||a.kickoffUTC.localeCompare(b.kickoffUTC));
 // Deduplicate team requirements so one team in multiple upcoming fixtures
 // does not appear as many separate purchase targets.
 const teamDemand=new Map(),leagueDemand=new Map();
 for(const fixture of coverage){
   for(const side of ['home','away']){
     const v=fixture[side],key=v.teamId;
     if(!positive(key))continue;
     const prev=teamDemand.get(key);
     if(!prev)teamDemand.set(key,{teamId:key,teamName:v.teamName,
       historyMatches:v.historyMatches,missingTo3:v.missingTo3,missingTo10:v.missingTo10,
       upcomingFixtures:1,earliestKickoffUTC:fixture.kickoffUTC,exampleFixtureId:fixture.fixtureId});
     else{
       prev.upcomingFixtures++;
       if(v.missingTo3>prev.missingTo3){
         prev.missingTo3=v.missingTo3;prev.missingTo10=v.missingTo10;prev.historyMatches=v.historyMatches;
       }
       if(fixture.kickoffUTC<prev.earliestKickoffUTC){
         prev.earliestKickoffUTC=fixture.kickoffUTC;
         prev.exampleFixtureId=fixture.fixtureId;
       }
     }
   }
   if(fixture.leagueId!==null){
     const group=leagueDemand.get(fixture.leagueId)||{leagueId:fixture.leagueId,
       leagueName:fixture.leagueName,incompleteFixtures:0,totalFixtures:0,fixtureTeamGaps:0};
     group.totalFixtures++;
     if(!fixture.completeFor3)group.incompleteFixtures++;
     group.fixtureTeamGaps+=fixture.totalTeamMatchGaps;
     leagueDemand.set(fixture.leagueId,group);
   }
 }
 const priorityTeams=[...teamDemand.values()].filter(x=>x.missingTo3>0)
   .sort((a,b)=>b.missingTo3-a.missingTo3||b.upcomingFixtures-a.upcomingFixtures||a.earliestKickoffUTC.localeCompare(b.earliestKickoffUTC));
 const priorityLeagues=[...leagueDemand.values()].sort((a,b)=>b.incompleteFixtures-a.incompleteFixtures||b.fixtureTeamGaps-a.fixtureTeamGaps);
 const leagueCount=new Map();for(const x of archived)leagueCount.set(x.league_id,(leagueCount.get(x.league_id)||0)+1);
 const report={registry:{name:HCR_NAME,code:HCR_CODE,mode:'TEST_ONLY',source:'NORMAL_HUB_CACHED_FINISHED',providerCalls:0,viewerImpact:'NONE'},checkedAtUTC:new Date(now*1000).toISOString(),
  scope:{businessDay:day,rounds:records.length,trackedRounds:verified,legacyUntrackedRounds:legacy,reviewRounds:review,missingArchiveEntries:missingArchive},
  rounds:records,
  inventory:{finishedFixtures:archived.length,ouDedicatedFT:ouTargetHistoryCoverage(db).ft,leagues:leagueCount.size,topLeagues:[...leagueCount].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([leagueId,finishedFixtures])=>({leagueId,finishedFixtures}))},
  supplyPlanning:{targetHistoryPerTeam:3,historySource:'DEDUPED_OU_ONLY_PLUS_1X2_BTTS_FINISHED_FT_ASOF',
    fixtureTargetStatuses:['scheduled','upcoming','waiting'],
    upcomingFixtures:coverage.length,readyFixtures:coverage.filter(f=>f.completeFor3).length,
    incompleteFixtures:coverage.filter(f=>!f.completeFor3).length,
    aggregateTeamMatchGaps:coverage.reduce((a,f)=>a+f.totalTeamMatchGaps,0),
    warning:'Gaps are per team/fixture, NOT distinct missing matches, provider API calls or purchasing quantity; cross-team duplicates are possible',
    upcomingLeagueIdsAvailable:coverage.filter(x=>x.leagueId!==null).length,
    upcomingLeagueIdsMissing:coverage.filter(x=>x.leagueId===null).length,
    uniqueTeams:teamDemand.size,uniqueTeamsNeedingHistory:priorityTeams.length,
    deduplicatedTeamMatchGaps:priorityTeams.reduce((a,t)=>a+t.missingTo3,0),
    warningUnits:'deduplicatedTeamMatchGaps counts missing match histories across unique teams, NOT distinct fixtures or provider API calls',
    priorityTeams:priorityTeams.slice(0,50),
    priorityLeagues:priorityLeagues.slice(0,20),
    highestPriority:coverage.slice(0,20)},
 };
 return report;
}
