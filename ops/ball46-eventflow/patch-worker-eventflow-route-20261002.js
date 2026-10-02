const fs=require('fs');
const mainPath=process.argv[2],assetPath=process.argv[3];
if(!mainPath||!assetPath)throw Error('USAGE: node patch-worker-eventflow-route main.js expanded.js');
let src=fs.readFileSync(mainPath,'utf8');
if(src.includes('__B46_EVENTFLOW_SIGNAL_JS_20261002__'))throw Error('WORKER_ALREADY_PATCHED');
const asset=fs.readFileSync(assetPath,'utf8');
const fn='async function noStoreUiAsset(request, env) {';
const pathLine='  const path = new URL(request.url).pathname;';
const gate='if (request.method === "GET" && (url.pathname === "/dashboard-v2-stage3.js" ||';
for(const [a,n] of [[fn,'NO_STORE_FN'],[pathLine,'PATH_LINE'],[gate,'GET_GATE']]){const c=src.split(a).length-1;if(c!==1)throw Error(`${n}_COUNT_${c}`)}
src=src.replace(fn,'const __B46_EVENTFLOW_SIGNAL_JS_20261002__='+JSON.stringify(asset)+';\n'+fn);
src=src.replace(pathLine,pathLine+'\n  if (path === "/expanded-match-343.js") {\n    const headers = new Headers({"content-type":"application/javascript; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate, max-age=0","pragma":"no-cache","expires":"0","x-ball46-ui-revision":"eventflow-signal-entry-20261002"});\n    return new Response(__B46_EVENTFLOW_SIGNAL_JS_20261002__, {status:200,headers});\n  }');
src=src.replace(gate,'if (request.method === "GET" && (url.pathname === "/expanded-match-343.js" || url.pathname === "/dashboard-v2-stage3.js" ||');
if((src.match(/__B46_EVENTFLOW_SIGNAL_JS_20261002__/g)||[]).length!==2)throw Error('OVERRIDE_REF_COUNT_BAD');
if(!src.includes('url.pathname === "/expanded-match-343.js" || url.pathname === "/dashboard-v2-stage3.js"'))throw Error('FETCH_GATE_PATCH_MISSING');
fs.writeFileSync(mainPath,src);
console.log(JSON.stringify({ok:true,assetBytes:asset.length,workerBytes:src.length}));