import {DurableObject} from 'cloudflare:workers';
import {applySnapshot,inspectSidecar,captureCanonicalHub} from './worker.mjs';
const line=(status,scoreHome=0,scoreAway=0,goalooId='GO-111',home='Bangkok Utd',away='Buriram Utd')=>
 "A[0]=['"+goalooId+"','101','','','"+home+"','"+away+"','2026-10-18 10:00:00','','"+status+"','"+scoreHome+"','"+scoreAway+"'];";
const source=(status,scoreHome=0,scoreAway=0,other='')=>
 "var A=[];var B=[];\nB[101]=['','','Thai League'];\n"+line(status,scoreHome,scoreAway)+other+"\n";
const f={fixtureId:'5USD-8888',home:'Bangkok United',away:'Buriram United',
 league:'Thai League',kickoffUtc:'2026-10-18T10:00:00.000Z'};
export class SidecarLocalTest extends DurableObject{
 async canonicalOnlyTest(){
  const t='2026-10-18T08:00:00Z',fixture={
    fixtureId:'5USD-CAPTURE-1',home:'Home United',away:'Away United',
    league:'Thai League',kickoffUtc:'2026-10-18T09:00:00Z'
  };
  const first=await captureCanonicalHub(this.ctx.storage,[fixture],{at:t});
  const second=await captureCanonicalHub(this.ctx.storage,[fixture],{at:'2026-10-18T08:05:00Z'});
  const drift=await captureCanonicalHub(this.ctx.storage,[{...fixture,home:'Impostor FC'}],
    {at:'2026-10-18T08:10:00Z'});
  const noFixture=await captureCanonicalHub(this.ctx.storage,[],
    {at:'2026-10-18T08:15:00Z'});
  const dup={...fixture,fixtureId:'5USD-CAPTURE-DUP'};
  const duplicateBatch=await captureCanonicalHub(this.ctx.storage,[
   dup,{...dup,home:'Wrong Duplicate FC'}
  ],{at:'2026-10-18T08:20:00Z'});
  const snapshot=await inspectSidecar(this.ctx.storage);
  const key='ball46:verified-fixture-crosswalk:v3:f:5USD-CAPTURE-1';
  const durable=await this.ctx.storage.get(key);
  const ok=first.inserted===1&&second.inserted===0&&second.unchanged===1&&
    drift.conflicts===1&&noFixture.inserted===0&&duplicateBatch.rejected===2&&
    duplicateBatch.inserted===0&&durable?.home==='Home United'&&snapshot.fixtureCount===1;
  return Response.json({ok,first,second,drift,noFixture,duplicateBatch,snapshot,
   heldOriginal:durable?.home,engineWrites:0},{status:ok?200:500});
 }
 async stressTest(){
  const base=Date.parse('2026-10-01T00:00:00Z');
  const hub=Array.from({length:1443},(_,i)=>({
   fixtureId:'5USD-L-'+i,home:'Alpha FC',away:'Beta United',league:'League A',
   kickoffUtc:new Date(base+i*40*60_000).toISOString()
  }));
  const a=Array.from({length:752},(_,i)=>{
   const time=new Date(base+i*40*60_000).toISOString().slice(0,19).replace('T',' ');
   return "A["+i+"]=['GO-"+i+"','1','','','Alpha FC','Beta United','"+time+"','','2','0','0'];";
  });
  const js="var A=[];var B=[];\nB[1]=['','','League A'];\n"+a.join('\n');
  const t0=Date.now();
  const r=await applySnapshot(this.ctx.storage,{hubFixtures:hub,goalooText:js,
   at:new Date(base+1000*40*60_000).toISOString(),
   utcCertified:true,ftCertified:true,offsetMinutes:0});
  const elapsedMs=Date.now()-t0;
  const size=await inspectSidecar(this.ctx.storage);
  const ok=r.inserted===1443&&r.matched===752&&r.sourceCount===752&&
   size.fixtureCount===1443&&size.sourceMappings===752&&r.ftReady===0;
  return Response.json({ok,inserted:r.inserted,matched:r.matched,
   sourceCount:r.sourceCount,elapsedMs,stored:size,productionWrites:0},
   {status:ok?200:500});
 }
 async fetch(req){
  const path=new URL(req.url).pathname;
  if(path==='/canonical-only')return this.canonicalOnlyTest();
  if(path==='/stress')return this.stressTest();
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
 const path=new URL(request.url).pathname;
 const id=env.TEST.idFromName(path==='/stress'?'isolated-stress-crosswalk':path==='/canonical-only'?'isolated-canonical-only':'isolated-fixture-crosswalk');
 return env.TEST.get(id).fetch(request);
}};
