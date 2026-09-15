import {buildMockFullBoard} from './mock-fullboard.js';
import {createRuntimeState} from './central-runtime.js';
import {processCentralCycle} from './central-cycle.js';

let state=createRuntimeState();
const start=Date.parse('2026-09-15T02:00:00Z');
for(let i=0;i<16;i++){
  const observedAt=new Date(start+i*60000).toISOString();
  const payload=buildMockFullBoard(observedAt,i);
  const result=processCentralCycle(payload,state,{observedAt,provider:'MOCK_5USD',providerLive:false,providerRequestCount:0});
  state=result.state;
  if(result.snapshot.providerRequestCount!==0)throw new Error('Mock cycle created provider traffic');
  if(result.snapshot.hasMore)throw new Error('Unexpected mock pagination');
  if(result.snapshot.matches.length!==3)throw new Error('Mock normalization count mismatch');
}
const snapshot=state.lastGoodSnapshot;
if(!snapshot)throw new Error('No snapshot published');
if(snapshot.provider!=='MOCK_5USD')throw new Error('Provider mode is not mock');
if(snapshot.health?.sources?.some(x=>x.name==='5USD provider traffic'&&x.state!=='DISABLED'))throw new Error('Live provider unexpectedly enabled');
const rollingReady=snapshot.matches.filter(m=>m.rolling?.available).length;
if(rollingReady<1)throw new Error('Rolling 5-minute windows did not warm up');
console.log(JSON.stringify({ok:true,cycles:state.cycleNumber,providerRequests:snapshot.providerRequestCount,matches:snapshot.matches.length,signals:snapshot.counts.signal,ledger:snapshot.ledger.length,rollingReady},null,2));
