import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const A='62cb0db544160e6591342abd6b4f35cc',D='work/engine-memory-diagnosis-20261110';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{method:'GET',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_'+r.status);return j.result}
async function active(w){const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{version:d.versions[0].version_id,deployment:d.id}}
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,productionWrites:0,providerRequests:0,runtimeRequests:0};
await mkdir(D+'/source',{recursive:true});
try{
report.website=await active('ball46-production');
const website=await cf('/workers/workers/ball46-production/versions/'+report.website.version+'?include=modules');
const binding=website.bindings.find(b=>b.name==='ENGINE'&&b.type==='service');assert(binding,'ENGINE_BINDING_NOT_FOUND');
report.engineBinding={name:binding.name,service:binding.service,environment:binding.environment};
report.engine=await active(binding.service);
const engine=await cf('/workers/workers/'+binding.service+'/versions/'+report.engine.version+'?include=modules');
report.engineMain=engine.main_module;report.modules=engine.modules.map(m=>({name:m.name,type:m.content_type,bytes:Buffer.from(m.content_base64,'base64').length,sha:sha(Buffer.from(m.content_base64,'base64'))}));
report.bindings=engine.bindings.filter(b=>['durable_object_namespace','service'].includes(b.type)).map(b=>Object.fromEntries(Object.entries(b).filter(([k])=>['type','name','class_name','script_name','namespace_id','service','environment'].includes(k))));
const settings=await cf('/workers/scripts/'+binding.service+'/settings');
report.observability=settings.observability;report.limits=settings.limits;report.compatibilityDate=engine.compatibility_date;
for(const m of engine.modules){
if(!/javascript|text/.test(m.content_type)||Buffer.from(m.content_base64,'base64').length>4000000)continue;
const text=Buffer.from(m.content_base64,'base64').toString();
assert(!/(?:sk_live_|sk_test_|AIza)[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|Bearer [A-Za-z0-9._-]{24,}/.test(text),'SOURCE_SECRET_PATTERN_STOP');
const name=m.name.replace(/[^a-zA-Z0-9._-]/g,'_');
await writeFile(D+'/source/'+name,text);
}
report.websiteAfter=await active('ball46-production');report.engineAfter=await active(binding.service);
assert.deepEqual(report.websiteAfter,report.website,'WEBSITE_CHANGED');assert.deepEqual(report.engineAfter,report.engine,'ENGINE_CHANGED');report.ok=true;
}catch(e){report.ok=false;report.error=String(e.stack);process.exitCode=1}
await writeFile(D+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));