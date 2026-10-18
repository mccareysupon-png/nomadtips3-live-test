import {DurableObject} from 'cloudflare:workers';
import {applySnapshot,inspectSidecar} from './worker.mjs';
const line=(status,scoreHome=0,scoreAway=0,goalooId='GO-111',home='Bangkok Utd',away='Buriram Utd')=>
 "A[0]=['"+goalooId+"','101','','','"+home+"','"+away+"','2026-10-18 10:00:00','','"+status+"','"+scoreHome+"','"+scoreAway+"'];";
const source=(status,scoreHome=0,scoreAway=0,other='')=>
 "var A=[];var B=[];\nB[101]=['','','Thai League'];\n"+line(status,scoreHome,scoreAway)+other+"\n";
const f={fixtureId:'5USD-8888',home:'Bangkok United',away:'Buriram United',
 league:'Thai League',kickoffUtc:'2026-10-18T10:00:00.000Z'};
export class SidecarLocalTest extends DurableObject{
 async fetch(req){
  const path=new URL(req.url).pathname;
  if(path!=='/selftest')return Response.json({error:'UNKNOWN'},{status:404});
  const t0='2026-10-18T11:00:00Z',
   t1='2026-10-18T12:00:00Z',t2='2026-10-18T12:01:05Z';
  const config={storage:this.ctx.storage,utcCertified:true,ftCertified:true,offsetMinutes:0};
  const early=await applySnapshot(this.ctx.storage,{hubFixtures:[f],
    goalooText:source('2'),at:t0,utcCertified:true,ftCertified:true,offsetMinutes:0});
  // 5USD hub has dropped the fixture; persisted crosswalk must still work.
  const first=await applySnapshot(this.ctx.storage,{hubFixtures:[],
    goalooText:source('-1',2,1),at:t1,utcCertified:true,ftCertified:true,offsetMinutes:0});
  const second=await applySnapshot(this.ctx.storage,{hubFixtures:[],
    goalooText:source('-1',2,1),at:t2,utcCertified:true,ftCertified:true,offsetMinutes:0});
  const recorded=await inspectSidecar(this.ctx.storage);
  const goal=second.verifiedResults?.[0];
  const success=early.inserted===1&&early.matched===1&&
    first.ftReady===0&&second.ftReady===1&&goal?.fixtureId==='5USD-8888'&&
    goal?.sourceFixtureId==='GO-111'&&goal?.score.home===2&&goal?.score.away===1&&
    recorded.fixtureCount===1&&recorded.sourceMappings===1&&recorded.ftEvidenceKeys===1;
  return Response.json({ok:success,early:{
    captured:early.inserted,mapped:early.matched},
   first:{ready:first.ftReady},second:{ready:second.ftReady,resultId:goal?.fixtureId??null},
   stored:recorded,goalEvidence:goal?.score||null,
   nativeEngineCalls:0},{status:success?200:500});
 }
}
export default{fetch(request,env){
 const id=env.TEST.idFromName('isolated-fixture-crosswalk');
 return env.TEST.get(id).fetch(request);
}};
