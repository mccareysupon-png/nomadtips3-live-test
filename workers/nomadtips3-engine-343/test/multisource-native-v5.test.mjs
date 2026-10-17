import test from 'node:test';
import assert from 'node:assert/strict';
import { settleVerifiedGoalEvidence,nativeGoalMarkets } from '../src/multisource-native-v5.js';
class FakeDurableStorage{
 constructor(signals){this.data=new Map([['signals',structuredClone(signals)]]);this.tail=Promise.resolve();this.writes=0;}
 async get(k){return structuredClone(this.data.get(k))}
 transaction(cb){
  const run=async()=>{
    const snapshot=structuredClone([...this.data.entries()]);
    const temp=new Map(snapshot);
    const tx={get:async k=>structuredClone(temp.get(k)),put:async(k,v)=>{temp.set(k,structuredClone(v))}};
    const v=await cb(tx);
    const pre=JSON.stringify([...this.data.entries()]),post=JSON.stringify([...temp.entries()]);
    if(pre!==post){this.data=temp;this.writes++;}
    return v;
  };
  const output=this.tail.then(run);
  this.tail=output.catch(()=>{});
  return output;
 }
}
const base={fixtureId:'12345',status:'PENDING',selection:'HOME',line:0,odds:1.93,
  entryScore:{home:1,away:0},lockedAt:123456789,createdAt:123456789,priceStage:'inplay'};
const markets=['ft_1x2','ft_ah','ft_over','ft_under','ft_btts_no','ft_corner_over','ht_1x2','ft_cards_over'];
const signals=()=>markets.map((market,i)=>({...base,id:'signal-'+i,market,selection:
  market==='ft_over'?'OVER':market==='ft_under'?'UNDER':
  market==='ft_btts_no'?'NO':market==='ft_corner_over'?'OVER':
  market==='ft_cards_over'?'OVER':'HOME',
  line:market==='ft_over'?1.5:market==='ft_under'?2.5:
  market==='ft_corner_over'?4.5:market==='ft_cards_over'?3.5:
  market==='ft_ah'?-0.5:0
 }));
const candidate=(source='goaloo',other={})=>({source,fixtureId:'12345',verified:true,
 scope:'REGULATION_90',score:{home:2,away:0},verifiedAt:'2026-10-17T14:10:00Z',...other});

test('original Engine v5 native market list excludes HT, corners and cards',()=>{
 const m=nativeGoalMarkets();
 for(const x of ['ft_1x2','ft_ah','ft_over','ft_under','ft_btts_yes','ft_btts_no'])assert.ok(m.includes(x));
 for(const x of ['ft_corner_over','ft_corner_under','ft_cards_over','ht_1x2','ht_ah'])assert.ok(!m.includes(x));
});

test('native v5 formula settles only FT GOALS with unchanged signal parameters',async()=>{
 const rows=signals(),st=new FakeDurableStorage(rows);
 const r=await settleVerifiedGoalEvidence(st,candidate(),{now:()=>42});
 assert.equal(r.state,'SETTLED_BY_NATIVE_V5');
 assert.equal(r.count,5);
 const after=await st.get('signals');
 const settled=after.filter(x=>x.status==='SETTLED');
 assert.equal(settled.length,5);
 assert.deepEqual(Object.fromEntries(settled.map(x=>[x.market,x.result])),{
  ft_1x2:'WIN',ft_ah:'WIN',ft_over:'WIN',ft_under:'WIN',ft_btts_no:'WIN'
 });
 for(let i=0;i<rows.length;i++){
  for(const field of ['odds','line','entryScore','selection','lockedAt','createdAt','priceStage']){
   assert.deepEqual(after[i][field],rows[i][field],field+' changed');
  }
 }
 for(const x of after.filter(x=>x.status==='PENDING')){
  assert.equal(x.finalScore,undefined);
  assert.equal(x.result,undefined);
 }
 for(const x of settled){assert.deepEqual(x.finalScore,{home:2,away:0});assert.equal(x.finalCorners,undefined);}
});

test('two providers racing update each pending signal exactly once',async()=>{
 const st=new FakeDurableStorage(signals());
 const [a,b]=await Promise.all([
  settleVerifiedGoalEvidence(st,candidate('goaloo'),{now:()=>100}),
  settleVerifiedGoalEvidence(st,candidate('5usd',{score:{home:1,away:1}}),{now:()=>101})
 ]);
 assert.deepEqual([a.state,b.state],['SETTLED_BY_NATIVE_V5','NO_ACTION']);
 assert.equal(st.writes,1);
 const final=await st.get('signals');
 assert.equal(final.filter(x=>x.status==='SETTLED').length,5);
 assert.deepEqual(final.find(x=>x.market==='ft_1x2').finalScore,{home:2,away:0});
});

test('late conflicting score never replaces original winner',async()=>{
 const st=new FakeDurableStorage(signals());
 await settleVerifiedGoalEvidence(st,candidate('5usd'));
 const first=await st.get('signals');
 const next=await settleVerifiedGoalEvidence(st,candidate('goaloo',{score:{home:0,away:3}}));
 assert.equal(next.state,'NO_ACTION');
 assert.deepEqual(await st.get('signals'),first);
 assert.equal(st.writes,1);
});

test('invalid FT, missing scope, bad scores and missing certification rejected',async()=>{
 const st=new FakeDurableStorage(signals());
 for(const c of [candidate('goaloo',{verified:false}),candidate('goaloo',{scope:'EXTRA_TIME'}),
   candidate('5usd',{score:{home:null,away:1}}),candidate('5usd',{score:{home:-1,away:0}})]){
  const r=await settleVerifiedGoalEvidence(st,c);assert.equal(r.state,'HOLD');
 }
 assert.equal(st.writes,0);
});

test('already settled rows are skipped without touching old Units/status',async()=>{
 const rows=signals();rows[0]={...rows[0],status:'SETTLED',result:'LOSS',unit:-1,settlementSource:'5usd'};
 const st=new FakeDurableStorage(rows);
 await settleVerifiedGoalEvidence(st,candidate('goaloo'));
 const a=await st.get('signals');
 assert.deepEqual(a[0],rows[0]);
});

test('fixture ID mismatch returns no action',async()=>{
 const st=new FakeDurableStorage(signals());
 const r=await settleVerifiedGoalEvidence(st,candidate('goaloo',{fixtureId:'wrong'}));
 assert.equal(r.state,'NO_ACTION');assert.equal(st.writes,0);
});

test('refuses non-transactional storage',async()=>{
 await assert.rejects(settleVerifiedGoalEvidence({get:async()=>signals()},candidate()),/ATOMIC_DURABLE_STORAGE_REQUIRED/);
});
