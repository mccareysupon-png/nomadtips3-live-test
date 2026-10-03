import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN, script='ball46-production';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
async function api(path){const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,`API_${r.status}`);return j.result;}
async function active(){const d=await api(`/scripts/${script}/deployments?per_page=3`);const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'MIXED');return v[0].version_id;}
const versionId=await active();
const settings=await api(`/scripts/${script}/settings`);
const version=await api(`/workers/${script}/versions/${versionId}?include=modules`);
function safeBinding(b){return {name:b.name,type:b.type,service:b.service??null,environment:b.environment??null,namespace_id:b.namespace_id?'<present>':null,dataset:b.dataset??null};}
const summary={versionId,settingsKeys:Object.keys(settings).sort(),settingsTopLevel:Object.fromEntries(Object.entries(settings).map(([k,v])=>[k,{type:Array.isArray(v)?'array':typeof v,sha:sha(v),summary:k==='bindings'&&Array.isArray(v)?v.map(safeBinding):k==='assets'?v:k==='compatibility_date'||k==='compatibility_flags'||k==='usage_model'||k==='placement'||k==='observability'?v:'<hashed>'}])),version:{main_module:version.main_module,compatibility_date:version.compatibility_date,compatibility_flags:version.compatibility_flags||[],bindings:(version.bindings||[]).map(safeBinding),assets:version.assets,usage_model:version.usage_model,placement:version.placement,observability:version.observability}};
mkdirSync('audit',{recursive:true});writeFileSync('audit/settings-scout.json',JSON.stringify(summary,null,2));
console.log('ACTIVE_VERSION='+versionId);console.log('SETTINGS_KEYS='+summary.settingsKeys.join(','));
for(const [k,v] of Object.entries(summary.settingsTopLevel))console.log(`SETTING ${k} type=${v.type} sha=${v.sha} summary=${JSON.stringify(v.summary)}`);
console.log('VERSION_STABLE='+JSON.stringify(summary.version));
assert.equal(await active(),versionId,'PRODUCTION_MOVED');
console.log('SETTINGS_SCOUT_SUCCESS');
