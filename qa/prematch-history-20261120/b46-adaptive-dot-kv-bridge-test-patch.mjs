// Add a private Cloudflare-native KV report to TEST scheduled Adaptive Risk Guard.
// Cloudflare API can read KV directly; Dot does not need custom HTTP or owner browser session.
// No Ledger raw rows, odds, fixtures, provider requests, formula modifications, or active controls.
import assert from 'node:assert/strict';
export const KV_NAME='B46_DOT_RISK_SNAPSHOT_KV';
export const KV_KEY='adaptive-risk-supervisor/latest-v1-test';
export const KV_NAMESPACE='c3ce9ac5641a45cca03ec318a35c6872';
const once=(s,a,b,why)=>{const n=s.split(a).length-1;assert.equal(n,1,why+' EXPECTED_EXACTLY_ONCE, FOUND '+n);return s.replace(a,b)};
export function patchDotKvTestWorker(source){
 assert(source.includes('B46_DOT_READ_ONLY_CRON_V1'),'EXISTING_TEST_DOT_PRIVATE_READER_REQUIRED');
 assert(!source.includes('B46_DOT_PRIVATE_KV_CRON_EXPORT_V1'),'ALREADY_KV_PATCHED');
 const anchor="console.log('B46_ADAPTIVE_OU_RESEARCH_V1_TEST candidates='+(d.counts?.uniqueFixturesWithPatterns??0)   +' priced='+(d.priced?.fixtures??0)+' picks='+(d.record?.added??0)+' paid='+(d.providerCalls??0));";
 const inserted=String.raw`// B46_DOT_PRIVATE_KV_CRON_EXPORT_V1
  if(env.B46_DOT_RISK_SNAPSHOT_KV){
   try{
    const probe=await b46s.fetch('https://prematch.internal/adaptive-dot-risk-internal-test',{
     method:'GET',headers:{'x-b46-control-role':'DOT_READER'}});
    const report=await probe.json();
    const valid=probe.status===200&&report?.status==='OK'&&report?.code==='B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST'&&
      report?.summary?.totalFormulas===42&&Array.isArray(report?.formulas)&&report.formulas.length===42&&
      report?.freshness?.cronSource==='CLOUDFLARE_SCHEDULED_15M'&&
      report.freshness.cronRiskGuardBefore?.checked===42&&report.freshness.cronRiskGuardAfter?.checked===42;
    const asOf=new Date().toISOString();
    const exportData=valid?{...report,privateTransport:'CLOUDFLARE_KV_ACCOUNT_API_ONLY',
      snapshotRecordedAt:asOf,staleAfter:new Date(Date.now()+35*60*1000).toISOString()}:
      {code:'B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST',readOnly:true,privateTransport:'CLOUDFLARE_KV_ACCOUNT_API_ONLY',
       status:'UNAVAILABLE',reason:'WORKER_INTERNAL_RISK_READ_OR_QUALITY_INVALID',
       snapshotRecordedAt:asOf,staleAfter:null,summary:null,formulas:null};
    await env.B46_DOT_RISK_SNAPSHOT_KV.put('adaptive-risk-supervisor/latest-v1-test',
      JSON.stringify(exportData),{expirationTtl:2400});
    console.log('B46_DOT_KV_CRON_EXPORT_V1 status='+exportData.status+
      ' formulas='+(Array.isArray(exportData.formulas)?exportData.formulas.length:'UNAVAILABLE')+
      ' riskGuardBefore='+(report?.freshness?.cronRiskGuardBefore?.checked??'UNAVAILABLE')+
      ' riskGuardAfter='+(report?.freshness?.cronRiskGuardAfter?.checked??'UNAVAILABLE'));
   }catch(error){
    try{
      await env.B46_DOT_RISK_SNAPSHOT_KV.put('adaptive-risk-supervisor/latest-v1-test',
       JSON.stringify({code:'B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST',readOnly:true,
        privateTransport:'CLOUDFLARE_KV_ACCOUNT_API_ONLY',status:'UNAVAILABLE',
        reason:'KV_EXPORT_ERROR',snapshotRecordedAt:new Date().toISOString(),
        staleAfter:null,summary:null,formulas:null}),{expirationTtl:2400});
    }catch{}
    console.log('B46_DOT_KV_CRON_EXPORT_UNAVAILABLE');
   }
  }
`;
 return once(source,anchor,anchor+'\n  '+inserted,'SCHEDULED_ADAPTIVE_LOG_ANCHOR');
}
