// Transform a copy of the exact currently deployed HUB source. No deployment.
// The artifact is a test candidate, not an automatically deployable release.
function once(s,needle,replace){if(s.split(needle).length!==2)throw Error('SOURCE_ANCHOR_CHANGED: '+needle.slice(0,90));return s.replace(needle,replace)}
export function patchHub(src){
 let s=src;
 s="import {HistoryAuthority,historyHandler} from './hub-history-authority.mjs';\n"+s;
 // Existing bulk transport already reserves through BulkSpeedPolicy. Rich shares
 // the same HUB actor's internal reserve/observe/failed routes, not a second DO.
 s=once(s,'async function providerJson(url, key) {','async function providerJson(url, key, shared) {\n  const lease=await shared.reserve();\n  if(!lease?.allowed)throw Object.assign(Error(lease?.reason||"RICH_SHARED_DENIED"),{status:429,retryAfter:60});\n  let observed=false;');
 s=once(s,'    const text2 = await r.text();','    await shared.observe(r,lease); observed=true;\n    const text2 = await r.text();');
 s=once(s,'    clearTimeout(timer);\n  }\n}\n__name(providerJson, "providerJson");','    clearTimeout(timer);\n    if(!observed)await shared.failed(lease);\n  }\n}\n__name(providerJson, "providerJson");');
 s=once(s,'this.env.FIVEDOLLAR_API_KEY);\n      const guard = {','this.env.FIVEDOLLAR_API_KEY, sharedRich(this.env));\n      const guard = {');
 // Explicitly separate trusted DO-internal routes from viewer routes. Use
 // service binding + secret for history only, not public viewer endpoints.
 // The existing public router does NOT forward /__history/*.
 const extra="\nconst sharedRich = env => {\n const stub=env.HUB.get(env.HUB.idFromName(\"global\"));\n async function rpc(path,body){const r=await stub.fetch(\"https://hub.internal/__history/\"+path,{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify(body)});if(!r.ok)throw Error(\"SHARED_RPC_\"+r.status);return r.json()}\n return {reserve:()=>rpc(\"rich-reserve\",{}),observe:async(r,lease)=>rpc(\"rich-observe\",{status:r.status,headers:Object.fromEntries([\"x-ratelimit-limit\",\"x-ratelimit-remaining\",\"x-ratelimit-reset\",\"retry-after\",\"date\"].map(k=>[k,r.headers.get(k)]).filter(x=>x[1]!=null)),lease}),failed:lease=>rpc(\"rich-failed\",{lease})};\n};\nfunction attachHistory(actor,req){\n const u=new URL(req.url);\n if(!u.pathname.startsWith(\"/__history/\"))return null;\n if(req.method!==\"POST\"||u.hostname!==\"hub.internal\")return Promise.resolve(new Response(\"Not found\",{status:404}));\n const a=actor.__historyAuthority??=new HistoryAuthority(actor.bulkSpeed,{enabled:false,coordinated:false,clock:actor.bulkSpeed.clock});\n return (async()=>{\n   const path=u.pathname.split(\"/\").pop();\n   const j=await req.json();\n   if(path===\"rich-reserve\")return Response.json(await a.reserve({kind:\"RICH_ODDS\"}));\n   if(path===\"rich-observe\"||path===\"rich-failed\"){\n    const lease=j.lease,t=await actor.bulkSpeed.telemetry();\n    if(!lease||!t.pending.some(x=>x.id===lease.id&&x.kind===\"RICH_ODDS\"))return new Response(\"Not found\",{status:404});\n    if(path===\"rich-failed\")await a.failed(lease);\n    else await a.observe(new Response(null,{status:j.status,headers:j.headers}),lease);\n    return Response.json({ok:true});\n   }\n   if(path===\"page\")return Response.json({state:\"deferred_budget\",reason:\"HISTORY_DISABLED\"});\n   return new Response(\"Not found\",{status:404});\n })();\n}\n";

 s=once(s,'  async fetch(request) {\n    const u = new URL(request.url);','  async fetch(request) {\n    const history=attachHistory(this,request);if(history)return history;\n    const u = new URL(request.url);');
 s=once(s,'const bulkSpeedV3Default=wrapHub(index_viewer_safe_default);',extra+'\nconst bulkSpeedV3Default=wrapHub(index_viewer_safe_default);');
 s+='\nexport {fetchJson as __testBulk,providerJson as __testRich,sharedRich as __testRichRPC,attachHistory as __testAttachHistory};\n';
 return s;
}
