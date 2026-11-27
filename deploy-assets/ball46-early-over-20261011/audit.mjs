const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('NO_CF_CREDENTIALS');
const worker='nomadtips3-engine-343',base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const api=async path=>{const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_READ_'+r.status+'_'+JSON.stringify(j.errors));return j.result};
const d=await api('/scripts/'+worker+'/deployments');
const act=d.deployments?.[0]?.versions?.find(x=>Number(x.percentage)===100);
if(!act)throw Error('ACTIVE_VERSION_AMBIGUOUS');
const v=await api('/workers/'+worker+'/versions/'+act.version_id+'?include=modules');
const main=v.modules.find(x=>x.name===v.main_module);
const s=Buffer.from(main.content_base64,'base64').toString('utf8');
const {createHash}=await import('node:crypto');
console.log('AUDIT_ACTIVE',JSON.stringify({id:act.version_id,sha:createHash('sha256').update(s).digest('hex'),bytes:s.length}));
const lines=s.split('\n');
for(const name of ['reconcileSettled','basisPair','settleOu','archivalSignal','ledgerMarker','periodCompleteForSignal','settleMarketSignal','readWorkingSignals']){
 let re=new RegExp('(?:function|async function)\\s+'+name+'\\s*\\(');
 let i=lines.findIndex(x=>re.test(x));if(i<0)i=lines.findIndex(x=>x.includes(' '+name+'('));
 console.log('AUDIT_FN_'+name,JSON.stringify({line:i+1,found:i>=0,source:i>=0?lines.slice(Math.max(0,i-1),i+((name==='basisPair'||name==='reconcileSettled')?75:38)).join('\n').slice(0,10000):''}));
}
for(const name of ['async scan()','async syncStatisticsLedger(','async reconcileExternalFinal(','async upsertLedgerRows(','async compactWorkingSignalsAfterLedger(']){
 const i=lines.findIndex(x=>x.includes(name));
 const near=i<0?'':lines.slice(i,i+(name.includes('scan()')?180:95)).join('\n');
 let source=near.slice(0,name.includes('scan()')?28000:12500);
 if(name.includes('scan()')){
   const j=lines.findIndex((x,k)=>k>i&&x.includes('let reconciled = 0'));
   const k=lines.findIndex((x,z)=>z>j&&x.includes('const nonSettled ='));
   source=JSON.stringify({prefix:lines.slice(i,i+29).join('\n'),settlement:lines.slice(Math.max(i,j-4),Math.min(k+29,lines.length)).join('\n')});
 }
 console.log('AUDIT_METHOD_'+name.replace(/\W/g,'_'),JSON.stringify({line:i+1,found:i>=0,source}));
}
