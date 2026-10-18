import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePendingIdentities,bindResultProvider,acceptFinalScore} from '../src/multisource-result-v5.js';
class FakeDO{
 constructor(data){this.data=new Map(Object.entries(structuredClone(data)));this.tail=Promise.resolve();this.writes=0}
 async get(k){return structuredClone(this.data.get(k))}
 transaction(cb){
  const f=async()=>{
   const next=new Map(structuredClone([...this.data.entries()]));
   const tx={get:async k=>structuredClone(next.get(k)),put:async(k,v)=>next.set(k,structuredClone(v))};
   const r=await cb(tx);
   if(JSON.stringify([...next.entries()])!==JSON.stringify([...this.data.entries()])){this.writes++;this.data=next}
   return r;
  };
  const running=this.tail.then(f);this.tail=running.catch(()=>{});return running;
 }
}
const at=(v='2026-10-17T13:00:00Z')=>Date.parse(v);
const match={fixtureId:'B46-1',home:{name:'Alpha FC'},away:{name:'Beta United'},
  league:{name:'League A'},kickoffUtc:'2026-10-17T11:00:00Z'};
const pending=(market,other={})=>({id:'s-'+market,fixtureId:'B46-1',market,
 status:'PENDING',result:null,selection:market.includes('over')?'OVER':
 market.includes('under')?'UNDER':market.includes('btts')?'YES':'HOME',
 line:market==='ft_ah'?-0.5:1.5,odds:1.89,entryScore:{home:1,away:0},
 priceStage:'inplay',entryMinute:68,createdAt:1,...other});
const mk=()=>new FakeDO({board:{fixtures:[match]},signals:[
 pending('ft_1x2'),pending('ft_ah'),pending('ft_over'),
 pending('ft_corner_over'),pending('ft_cards_over'),pending('ht_1x2')
]});
const cert={goaloo:{utcCertified:true,finalScopeCertified:true,samples:2,minGapMs:60_000}};
const claim={source:'goaloo',sourceFixtureId:'G-1',fixtureId:'B46-1',
 home:'Alpha FC',away:'Beta United',league:'League A',kickoffUtc:'2026-10-17T11:00:00Z'};
const observation=(source='goaloo',more={})=>({
 source,sourceFixtureId:source==='goaloo'?'G-1':'B46-1',fixtureId:'B46-1',
 home:'Alpha FC',away:'Beta United',league:'League A',kickoffUtc:'2026-10-17T11:00:00Z',
 status:source==='goaloo'?-1:'finished',statusCode:source==='goaloo'?null:'full',
 scoreScope:'REGULATION_90',score:{home:2,away:0},...more
});
async function setup({map=true}={}){
 const st=mk();
 const cap=await capturePendingIdentities(st);
 assert.equal(cap.captured,1);
 if(map){const b=await bindResultProvider(st,claim,{certifiedSources:cert});assert.equal(b.state,'MAPPED');}
 return st;
}
test('durably captures fixture ID/kickoff/league from native board only once',async()=>{
 const st=mk();assert.equal((await capturePendingIdentities(st)).captured,1);
 assert.equal((await capturePendingIdentities(st)).captured,0);
 assert.equal(st.writes,1);
});
test('does not fabricate fixture kickoff when missing',async()=>{
 const st=mk();st.data.get('board').fixtures[0].kickoffUtc=null;
 const x=await capturePendingIdentities(st);assert.equal(x.captured,0);assert.equal(x.missing,1);
});
test('mapping cannot be added for uncertified Goaloo',async()=>{
 const st=await setup({map:false});
 const a=await bindResultProvider(st,claim,{certifiedSources:{}});
 assert.equal(a.reason,'PROVIDER_NOT_CERTIFIED');
});
test('mapping requires immutable league, team and time',async()=>{
 const st=await setup({map:false});
 const a=await bindResultProvider(st,{...claim,home:'Wrong FC'},{certifiedSources:cert});
 assert.equal(a.reason,'MATCH_IDENTITY_UNVERIFIED');
});
test('verified first official 5USD FT can settle three FT GOALS native v5 signals',async()=>{
 const st=await setup();
 const r=await acceptFinalScore(st,observation('5usd'),{clock:()=>at(),certifiedSources:cert});
 assert.equal(r.state,'SETTLED');assert.equal(r.settled,3);
 const signals=await st.get('signals');
 assert.equal(signals.filter(x=>x.status==='SETTLED').length,3);
 assert.equal(signals.find(x=>x.market==='ft_ah').result,'WIN');
 assert.equal(signals.find(x=>x.market==='ft_over').result,'WIN');
 assert.equal(signals.find(x=>x.market==='ft_corner_over').status,'PENDING');
 assert.equal(signals.find(x=>x.market==='ft_cards_over').status,'PENDING');
 assert.equal(signals.find(x=>x.market==='ht_1x2').status,'PENDING');
 for(const x of signals){assert.equal(x.odds,1.89);assert.equal(x.priceStage,'inplay')}
});
test('Goaloo first requires two identical FT polls at least sixty seconds apart',async()=>{
 const st=await setup();
 const a=await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at()});
 assert.equal(a.state,'AWAITING_CONFIRMATION');
 const b=await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at('2026-10-17T13:01:02Z')});
 assert.equal(b.state,'SETTLED');assert.equal(b.settled,3);
 const row=(await st.get('signals')).find(x=>x.market==='ft_1x2');
 assert.equal(row.settlementSource,'goaloo');
});
test('Goaloo changed FT score resets confirmation window',async()=>{
 const st=await setup();
 await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at()});
 const r=await acceptFinalScore(st,observation('goaloo',{score:{home:2,away:1}}),{certifiedSources:cert,clock:()=>at('2026-10-17T13:01:10Z')});
 assert.equal(r.state,'AWAITING_CONFIRMATION');
});
test('duplicate timestamp poll does not permit Goaloo early settlement',async()=>{
 const st=await setup();
 await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at()});
 const r=await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at()});
 assert.equal(r.state,'AWAITING_CONFIRMATION');
});
test('source race locks single winning source and never rewrites settled score',async()=>{
 const st=await setup();
 const [a,b]=await Promise.all([
  acceptFinalScore(st,observation('5usd'),{certifiedSources:cert,clock:()=>at()}),
  acceptFinalScore(st,observation('goaloo',{score:{home:0,away:3}}),{certifiedSources:cert,clock:()=>at('2026-10-17T13:00:01Z')})
 ]);
 assert.equal(a.state,'SETTLED');
 assert.equal(b.state,'ALREADY_SETTLED');
 assert.equal(b.conflict,true);
 const row=(await st.get('signals')).find(x=>x.market==='ft_1x2');
 assert.equal(row.settlementSource,'5usd');
 assert.deepEqual(row.finalScore,{home:2,away:0});
});
test('already PENDING only: previous SETTLED unchanged',async()=>{
 const st=mk();st.data.get('signals')[0].status='SETTLED';st.data.get('signals')[0].result='LOSS';
 await capturePendingIdentities(st);
 const r=await acceptFinalScore(st,observation('5usd'),{clock:()=>at()});
 assert.equal(r.state,'SETTLED');assert.equal(r.settled,2);
 const row=(await st.get('signals'))[0];assert.equal(row.result,'LOSS');
});
test('unverified FT and illegal market scope fail closed',async()=>{
 const st=await setup();
 for(const x of [observation('goaloo',{status:2}),observation('5usd',{statusCode:'inplay'}),
   observation('goaloo',{scoreScope:'AFTER_PENALTIES'}),observation('goaloo',{score:{home:100,away:0}})]){
  const r=await acceptFinalScore(st,x,{certifiedSources:cert,clock:()=>at()});assert.equal(r.ok,false);
 }
});
test('unmapped or ambiguous provider ID cannot settle',async()=>{
 const st=await setup({map:false});
 const a=await acceptFinalScore(st,observation(),{certifiedSources:cert,clock:()=>at()});
 assert.equal(a.reason,'PROVIDER_ID_NOT_MAPPED');
});
test('no result before 90 minutes elapsed from kickoff',async()=>{
 const st=await setup();const r=await acceptFinalScore(st,observation('5usd'),{
 clock:()=>at('2026-10-17T11:45:00Z')});
 assert.equal(r.reason,'TOO_EARLY');
});
