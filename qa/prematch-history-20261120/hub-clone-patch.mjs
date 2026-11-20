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
 const extra=String.raw