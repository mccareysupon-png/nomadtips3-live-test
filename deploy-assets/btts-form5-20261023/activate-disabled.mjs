import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN,w='nomadtips3-engine-343';
assert.equal(acc,'62cb0db544160e6591342abd6b4f35cc');assert(tok);
const base='1f2336fa-7b45-4a23-a23c-06d01a92330d',candidate='e7c66b7b-ba60-497a-831c-193c0e93cad0';
const root='https://api.cloudflare.com/client/v4/accounts/'+acc;
async function api(p,body){
 if(body!==undefined)assert.equal(p,'/workers/scripts/'+w+'/deployments','ONLY_DEPLOYMENT_WRITE');
 const r=await fetch(root+p,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tok,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CLOUDFLARE_'+r.status+JSON.stringify(j.errors).slice(0,220));return j.result;
}
async function live(){const d=(await api('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return{id:d.versions[0].version_id,deployment:d.id};}
async function get(url){const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(55000)});if(!r.ok)throw Error('HTTP_'+r.status+url);return r.json();}
async function verify(wantEnabled){
 const {id}=await live();assert.equal(id,wantEnabled?candidate:base,'WRONG_ACTIVE');
 const prefix='https://ball46.com/api/engine/';
 const h=await get(prefix+'health');assert(h.ok&&Number(h.fixtureCount)>=0,'ENGINE_HEALTH_INVALID');
 const st=await get(prefix+'statistics?paged=1');assert(st.ok&&Number(st.ledgerTotal)>500,'LEDGER_DISAPPEARED');assert(st.settlementRevision&&st.statisticsLedgerVersion,'LEDGER_FIELDS_MISSING');assert(st.byMarket&&Array.isArray(st.rows),'BY_MARKET_MISSING');
 const si=await get(prefix+'signals');assert(si.ok&&Array.isArray(si.signals),'SIGNALS_UNAVAILABLE');
 const info=wantEnabled?await get(prefix+'form5-health'):null;
 if(wantEnabled)assert(info?.ok&&info.component==='BALL46_FORM5'&&info.enabled===false&&info.totalProviderCalls===0,'FORM5_NOT_DISABLED');
 return{version:id,engineHealth:{liveCount:h.liveCount,signalCount:h.signalCount},stats:{ledgerTotal:st.ledgerTotal,total:st.total,win:st.win,loss:st.loss,keys:Object.keys(st.byMarket)},signals:si.signals.length,form5:info};
}
const a={at:new Date().toISOString(),base,candidate,ok:false,checks:[]};await mkdir('audit',{recursive:true});
let deployed=false;try{
 const version=await api('/workers/workers/'+w+'/versions/'+candidate+'?include=modules');
 assert.equal(version.annotations?.['workers/tag'],'B46_BTTS_FORM5_CANDIDATE_DISABLED_20261023');
 assert(version.bindings?.some(x=>x.name==='FIVEDOLLAR_API_KEY'&&x.type==='secret_text'),'PROVIDER_SECRET_BINDING_MISSING');
 assert(version.modules?.length===4,'MODULES_MISSING');
 a.before=await verify(false);
 assert.equal((await live()).id,base,'PRODUCTION_CONCURRENT_CHANGE');
 const d=await api('/workers/scripts/'+w+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Stage BTTS Form5 disabled-only infrastructure; no provider requests or ledger mutation'}});
 deployed=true;a.deployment=d.id;
 const start=Date.now();let last;while(Date.now()-start<110000){try{last=await verify(true);break;}catch(e){last={error:String(e.message||e)};await new Promise(r=>setTimeout(r,2500));}}
 assert(last?.version===candidate,'CUTOVER_UNVERIFIED_'+JSON.stringify(last));
 a.after=last;a.ok=true;
 console.log('B46_FORM5_DISABLED_CUTOVER='+JSON.stringify({ok:true,active:candidate,deployment:a.deployment,form5Enabled:last.form5.enabled,statsTotal:last.stats.total,ledgerTotal:last.stats.ledgerTotal,signals:last.signals,providerCalls:last.form5.totalProviderCalls}));
}catch(e){
 a.error=String(e.stack||e);console.error('B46_FORM5_DISABLED_DEPLOY_ERROR='+String(e.message||e));
 if(deployed){try{
  const current=await live();if(current.id===candidate){await api('/workers/scripts/'+w+'/deployments',{strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback BTTS Form5 disabled staging candidate, restore original Engine343'}});a.rollback=await verify(false);}
  else a.rollbackSkippedNewerVersion=current;
 }catch(x){a.rollbackError=String(x.message||x)}}process.exitCode=1;
}
await writeFile('audit/disabled-activation.json',JSON.stringify(a,null,2));
