import {DurableObject} from 'cloudflare:workers';
import {capturePendingIdentities,bindResultProvider,acceptFinalScore} from './multisource-result-v5.js';
import {pollMappedGoaloo} from './goaloo-final-collector-v5.js';
const time=d=>Date.parse(d);
export class Ball46StagingResultObject extends DurableObject{
 async testParsedFeed(){
  const fixture={fixtureId:'B46-DO-2',home:{name:'Alpha FC'},away:{name:'Beta United'},
    league:{name:'League A'},kickoffUtc:'2026-10-17T11:00:00Z'};
  const signals=[
    {id:'score',fixtureId:'B46-DO-2',market:'ft_1x2',status:'PENDING',
      selection:'HOME',line:0,odds:1.95,createdAt:1},
    {id:'corner',fixtureId:'B46-DO-2',market:'ft_corner_over',status:'PENDING',
      selection:'OVER',line:8.5,odds:1.84,createdAt:1}
  ];
  await this.ctx.storage.put('board',{fixtures:[fixture]});
  await this.ctx.storage.put('signals',signals);
  const captured=await capturePendingIdentities(this.ctx.storage);
  const js=[
    "var A=[];var B=[];",
    "B[19]=['','','League A'];",
    "A[0]=['GO-2','19','','','Alpha FC','Beta United','2026-10-17 11:00:00','','-1','2','0'];"
  ].join('\n');
  const common={storage:this.ctx.storage,sourceText:js,fixtureIds:['B46-DO-2'],
    utcCertified:true,finalScopeCertified:true,offsetMinutes:0};
  const first=await pollMappedGoaloo({...common,clock:()=>time('2026-10-17T13:00:00Z')});
  const second=await pollMappedGoaloo({...common,clock:()=>time('2026-10-17T13:01:05Z')});
  const rows=await this.ctx.storage.get('signals')||[];
  const report={ok:captured.captured===1&&first.parsedFT===1&&first.matched===1&&
    first.results[0].result==='AWAITING_CONFIRMATION'&&
    second.results[0].result==='SETTLED'&&second.results[0].settled===1&&
    rows.find(x=>x.id==='score')?.result==='WIN'&&
    rows.find(x=>x.id==='score')?.odds===1.95&&
    rows.find(x=>x.id==='corner')?.status==='PENDING',
    executor:'CLOUDFLARE_DURABLE_OBJECT_LOCAL_PARSED_GOALOO',
    captured,first,second,rows};
  return Response.json(report,{status:report.ok?200:500});
 }
 async fetch(request){
  const u=new URL(request.url);
  if(u.pathname==='/test-goaloo-feed')return this.testParsedFeed();
  if(u.pathname!=='/test-native-do')return Response.json({ok:false,error:'NOT_FOUND'},{status:404});
  const boardFixture={fixtureId:'B46-DO-1',home:{name:'Alpha FC'},
    away:{name:'Beta United'},league:{name:'League A'},kickoffUtc:'2026-10-17T11:00:00Z'};
  const signals=[
    {id:'a',fixtureId:'B46-DO-1',market:'ft_ah',status:'PENDING',result:null,
     selection:'HOME',line:-0.5,odds:1.88,entryScore:{home:1,away:0},createdAt:1},
    {id:'b',fixtureId:'B46-DO-1',market:'ft_corner_over',status:'PENDING',result:null,
     selection:'OVER',line:8.5,odds:1.87,entryScore:{home:1,away:0},createdAt:1}
  ];
  await this.ctx.storage.put('board',{fixtures:[boardFixture]});
  await this.ctx.storage.put('signals',signals);
  const captured=await capturePendingIdentities(this.ctx.storage);
  const policies={goaloo:{utcCertified:true,finalScopeCertified:true,samples:2,minGapMs:60_000}};
  const mapping=await bindResultProvider(this.ctx.storage,{
    fixtureId:'B46-DO-1',source:'goaloo',sourceFixtureId:'GO-1',
    kickoffUtc:'2026-10-17T11:00:00Z',league:'League A',home:'Alpha FC',away:'Beta United'
  },{certifiedSources:policies});
  const obs={fixtureId:'B46-DO-1',source:'goaloo',sourceFixtureId:'GO-1',
    kickoffUtc:'2026-10-17T11:00:00Z',league:'League A',home:'Alpha FC',away:'Beta United',
    score:{home:2,away:0},status:-1,scoreScope:'REGULATION_90'};
  const first=await acceptFinalScore(this.ctx.storage,obs,{
    certifiedSources:policies,clock:()=>time('2026-10-17T13:00:00Z')});
  const second=await acceptFinalScore(this.ctx.storage,obs,{
    certifiedSources:policies,clock:()=>time('2026-10-17T13:01:10Z')});
  const late=await acceptFinalScore(this.ctx.storage,{...obs,source:'5usd',sourceFixtureId:'B46-DO-1',
    status:'finished',statusCode:'full',score:{home:0,away:3}},{
    certifiedSources:policies,clock:()=>time('2026-10-17T13:01:11Z')});
  const rows=await this.ctx.storage.get('signals')||[];
  const report={ok:captured.captured===1&&mapping.state==='MAPPED'&&
   first.state==='AWAITING_CONFIRMATION'&&second.state==='SETTLED'&&second.settled===1&&
   late.state==='ALREADY_SETTLED'&&late.conflict===true&&
   rows.find(x=>x.id==='a')?.result==='WIN'&&
   rows.find(x=>x.id==='a')?.odds===1.88&&
   rows.find(x=>x.id==='b')?.status==='PENDING',
   captured,mapping,first,second,late,rows,executor:'CLOUDFLARE_DURABLE_OBJECT_LOCAL'};
  return Response.json(report,{status:report.ok?200:500});
 }
}
export default{fetch(request,env){
  const id=env.STAGING_DO.idFromName(new URL(request.url).pathname==='/test-goaloo-feed'?'isolated-goaloo-feed-do':'isolated-test-do');
  return env.STAGING_DO.get(id).fetch(request);
}};
