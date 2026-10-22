const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
if(!ACCOUNT||!TOKEN)throw Error('NO_CLOUDFLARE_AUTH');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT, NAME='ball46-production';
const redact=v=>JSON.stringify(v).slice(0,800);
async function get(path){
 const r=await fetch(ROOT+path,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(30000)});
 const data=await r.json().catch(()=>({}));if(!r.ok||!data.success){console.log('B46_V13_ASSET_BINDING_API_ERROR',JSON.stringify({path,status:r.status,errors:data.errors}));return null}
 return data.result;
}
const active=await get('/workers/scripts/'+NAME+'/deployments?per_page=1');
const versionActive=active?.deployments?.[0]?.versions?.[0]?.version_id;
console.log('B46_V13_ACTIVE_VERSION',JSON.stringify({version:versionActive,deployment:active?.deployments?.[0]?.id}));
const versions=await get('/workers/workers/'+NAME+'/versions?per_page=100');
const list=Array.isArray(versions)?versions:(versions?.items||versions?.versions||[]);
console.log('B46_V13_VERSION_LIST',JSON.stringify({keys:Object.keys(versions||{}),recent:list.slice(0,12).map(x=>({id:x.id,number:x.number,created:x.created_on})),size:list.length}));
const prefs=['578fd91b','064763e4','f71b04c1','17be50b1','7dc75355','83e1752e'];
for(const prefix of prefs){
 const v=prefix==='578fd91b'?versionActive:list.find(x=>x.id?.startsWith(prefix))?.id;
 if(!v){console.log('B46_V13_VERSION_ASSET_BINDINGS',JSON.stringify({prefix,found:false}));continue;}
 const d=await get('/workers/workers/'+NAME+'/versions/'+v+'?include=modules');
 if(!d){continue;}
 const modules=d.modules||[];
 const indexHtml=modules.find(m=>m.name==='assets/index.html');
 const assetHtml=indexHtml?.content_base64?Buffer.from(indexHtml.content_base64,'base64').toString('utf8'):'';
 console.log('B46_V13_WORKER_STATIC_ASSET_MARKERS',JSON.stringify({prefix,htmlLength:assetHtml.length,
  markers:['b46-dark-match-deep-graphite-teal-20261020','b46-dark-match-hover-active-20261020',
   'b46-pc-active-only-expanded-20261020','B46_MOBILE_CARD_RESTORED_20261020',
   'b46-featured-approved-sections-v10-20261021','b46-statistics-no-old-flash-20261022'
  ].map(m=>({key:m,present:assetHtml.includes(m),count:assetHtml.split(m).length-1})),
  hasCloseBody:assetHtml.includes('</body>')}));

 const types=(d.bindings||[]).map(x=>({name:x.name,type:x.type,
   sourceVersionId:x.version_id?.slice?.(0,8)||null,
   namespaceProvided:!!x.namespace_id,durableEnv:x.environment||null}));
 console.log('B46_V13_VERSION_ASSET_BINDINGS',JSON.stringify({prefix,id:v,
  main:d.main_module,compatibility_date:d.compatibility_date,
  assetConfigured:!!d.assets,assetConfig:d.assets?.config||null,
  assetMetadataKeys:Object.keys(d.assets||{}).filter(x=>!/jwt|token/i.test(x)),
  bindings:types,
  moduleCount:modules.length,
  moduleSizes:modules.map(x=>({name:x.name,type:x.content_type,byteLength:x.content_base64?Math.floor(x.content_base64.length*3/4):0}))
 }));
}
