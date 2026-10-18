import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalooFTIndex,matchGoalooFT,pollMappedGoaloo} from '../src/goaloo-final-collector-v5.js';
import {capturePendingIdentities} from '../src/multisource-result-v5.js';
class FakeDO {
 constructor(data){this.data=new Map(Object.entries(structuredClone(data)));this.queue=Promise.resolve();}
 async get(k){return structuredClone(this.data.get(k))}
 transaction(cb){const run=async()=>{
  const temp=new Map(structuredClone([...this.data.entries()]));
  const tx={get:async k=>structuredClone(temp.get(k)),put:async(k,v)=>temp.set(k,structuredClone(v))};
  const out=await cb(tx);this.data=temp;return out;
 };const next=this.queue.then(run);this.queue=next.catch(()=>{});return next}
}
const live={fixtureId:'B46-2',home:{name:'Home FC'},away:{name:'Away FC'},
 league:{name:'League A'},kickoffUtc:'2026-10-17T11:00:00Z'};
const script=[
 "var A=[];var B=[];",
 "B[19]=['','','League A'];",
 "A[0]=['G-200','19','','','Home FC','Away FC','2026-10-17 11:00:00','','-1','2','0'];",
 "A[1]=['G-201','19','','','Other FC','No FC','2026-10-17 11:00:00','','2','1','0'];"
].join('\n');
const millis=v=>Date.parse(v);
test('Goaloo JavaScript array feed parsed as data, only -1 terminal FT',()=>{
 const result=parseGoalooFTIndex(script,{offsetMinutes:0});
 assert.equal(result.ok,true);assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].sourceFixtureId,'G-200');
 assert.deepEqual(result.rows[0].score,{home:2,away:0});
 assert.equal(result.rows[0].kickoffUtc,'2026-10-17T11:00:00.000Z');
});
test('unverified timezone fails closed',()=>{
 assert.equal(parseGoalooFTIndex(script).reason,'OFFSET_UNVERIFIED');
});
test('mapping rejects incorrect league and accepts a reviewed alias',()=>{
 const result=parseGoalooFTIndex(script.replaceAll('League A','Other Competition'),{offsetMinutes:0});
 const c={fixtureId:'B46-2',home:'Home FC',away:'Away FC',league:'League A',kickoffUtc:'2026-10-17T11:00:00Z'};
 assert.equal(matchGoalooFT([c],result.rows).accepted.length,0);
 assert.equal(matchGoalooFT([c],result.rows,{approvedLeagueAliases:{'Other Competition':'League A'}}).accepted.length,1);
});
test('mapping with two duplicate candidate fixtures must HOLD',()=>{
 const result=parseGoalooFTIndex(script,{offsetMinutes:0});
 const c={fixtureId:'B46-2',home:'Home FC',away:'Away FC',league:'League A',kickoffUtc:'2026-10-17T11:00:00Z'};
 assert.equal(matchGoalooFT([c,{...c,fixtureId:'OTHER'}],result.rows).accepted.length,0);
});
test('Goaloo collector reaches native v5 settlement only after 2 distinct FT observations',async()=>{
 const storage=new FakeDO({board:{fixtures:[live]},signals:[
  {id:'AH',fixtureId:'B46-2',market:'ft_ah',status:'PENDING',selection:'HOME',
    line:-0.5,odds:1.91,entryScore:{home:1,away:0}},
  {id:'CORNER',fixtureId:'B46-2',market:'ft_corner_over',status:'PENDING',
    selection:'OVER',line:8.5,odds:1.83}
 ]});
 const cap=await capturePendingIdentities(storage);assert.equal(cap.captured,1);
 const x={storage,sourceText:script,fixtureIds:['B46-2'],utcCertified:true,
  finalScopeCertified:true,offsetMinutes:0};
 const first=await pollMappedGoaloo({...x,clock:()=>millis('2026-10-17T13:00:00Z')});
 const second=await pollMappedGoaloo({...x,clock:()=>millis('2026-10-17T13:01:03Z')});
 assert.equal(first.results[0].result,'AWAITING_CONFIRMATION');
 assert.equal(second.results[0].result,'SETTLED');
 const rows=await storage.get('signals');
 assert.equal(rows[0].result,'WIN');assert.equal(rows[0].odds,1.91);
 assert.equal(rows[1].status,'PENDING');
});
test('uncertified source makes no persistent writes or settlements',async()=>{
 const storage=new FakeDO({board:{fixtures:[live]},signals:[]});
 const result=await pollMappedGoaloo({storage,sourceText:script,fixtureIds:[],
  utcCertified:false,finalScopeCertified:false,offsetMinutes:0});
 assert.equal(result.ok,false);assert.equal(storage.data.size,2);
});
