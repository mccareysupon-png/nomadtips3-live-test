import worker from './worker-staged.js';

const env={NOMAD341_LIVE_PROVIDER_ENABLED:'false',NOMAD341_MACHINE_ID:'341-STAGED-A',NOMAD341_ADMIN_TOKEN:'test-owner-token'};
const call=async(path,{method='GET',body}={})=>{
  const req=new Request('https://nomad.test'+path,{method,headers:method==='POST'?{'content-type':'application/json','authorization':'Bearer test-owner-token'}:undefined,body:body?JSON.stringify(body):undefined});
  const res=await worker.fetch(req,env);return {status:res.status,json:await res.json()};
};

let r=await call('/api/nomad341/control');
if(r.status!==200)throw new Error('control read failed');
if(r.json.hardProviderGate!==false)throw new Error('hard gate unexpectedly enabled');
if(r.json.effectiveProviderEnabled!==false)throw new Error('provider unexpectedly effective');
if(r.json.currentMachineId!=='341-STAGED-A')throw new Error('machine id mismatch');

r=await call('/api/nomad341/control',{method:'POST',body:{action:'PATCH',masterApiEnabled:true,pollingEnabled:true,activeMachineId:'341-STAGED-A',pollIntervalSeconds:15,requestTimeoutMs:15000}});
if(r.status!==200)throw new Error('control patch failed');
if(r.json.control.masterApiEnabled!==true||r.json.control.pollingEnabled!==true)throw new Error('switch patch not saved');
if(r.json.control.effectiveProviderEnabled!==false)throw new Error('hard gate did not block effective provider');

r=await call('/api/nomad341/control/run',{method:'POST',body:{mode:'MOCK'}});
if(r.status!==200||r.json.success!==1)throw new Error('mock cycle failed');
if(Number(r.json.snapshot?.providerRequestCount)!==0)throw new Error('mock cycle created provider traffic');

r=await call('/api/nomad341/control/run',{method:'POST',body:{mode:'PROVIDER'}});
if(r.status!==409)throw new Error('provider run should be blocked while hard gate is off');
if(r.json.reason!=='PROVIDER_NOT_AUTHORIZED')throw new Error('unexpected provider block reason');

r=await call('/api/nomad341/check');
if(r.status!==200)throw new Error('data check failed');
if(Number(r.json.request?.providerRequestsThisCycle)!==0)throw new Error('diagnostics show provider traffic');
if(r.json.safety?.cardClickProviderRequests!==0)throw new Error('card-click invariant broken');
if(r.json.safety?.priceRefereeProviderRequests!==0)throw new Error('referee invariant broken');
if(r.json.safety?.maxConcurrentProviderRequests!==1)throw new Error('concurrency invariant broken');

console.log(JSON.stringify({ok:true,hardGate:r.json.request.hardProviderGate,effective:r.json.request.effectiveProviderEnabled,providerRequests:r.json.request.providerRequestsThisCycle,activeMachine:r.json.control.activeMachineId,mode:r.json.snapshot.provider},null,2));
