// Temporary credential-gated verifier; never forwards test writes to production.
const res=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export default {async fetch(req,env){
 if(!env.SHADOW_HEALTH_TOKEN||req.headers.get('authorization')!=='Bearer '+env.SHADOW_HEALTH_TOKEN)return res({ok:false},403);
 const path=new URL(req.url).pathname;
 const health=async authenticated=>env.B46_SHADOW_RECEIVER.fetch('https://shadow.internal/health',{headers:authenticated?{authorization:'Bearer '+env.SHADOW_HEALTH_TOKEN}:{}});
 if(path==='/verify'&&req.method==='GET'){
  const rejected=await health(false),valid=await health(true);
  const state=await valid.json();return res({ok:rejected.status===403&&valid.status===200&&state.ok===true,unauthenticatedStatus:rejected.status,authenticatedStatus:valid.status,state},valid.status);
 }
 if(path==='/test-staging'&&req.method==='POST'&&env.TEST_MODE==='stage-only'){
  const events=[{signal_id:'stage-check-a',result:'HALF_WIN',market_type:'AH',odds:2,settled_at:1794900000000,previous_result:null},{signal_id:'stage-check-b',result:'LOSS',market_type:'AH',odds:2,settled_at:1794900000000,previous_result:null}];
  const send=()=>env.B46_SHADOW_RECEIVER.fetch('https://shadow.internal/settled',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events})});
  const first=await send(),again=await send();return res({ok:first.status===200&&again.status===200,first:first.status,again:again.status});
 }
 return res({ok:false},404);
}};
