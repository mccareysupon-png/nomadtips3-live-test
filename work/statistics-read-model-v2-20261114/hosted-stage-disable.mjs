// Fail-safe cleanup: only the script created by THIS run is allowed.
import {readFile,writeFile} from 'node:fs/promises';
const D='work/statistics-read-model-v2-20261114',A='62cb0db544160e6591342abd6b4f35cc';
const path=D+'/private-stage-config.json';
let x;try{x=JSON.parse(await readFile(path,'utf8'))}catch{console.log('STAGING_CLEANUP nothing to disable');process.exit(0)}
const expected='b46-statistics-test-'+process.env.GITHUB_RUN_ID;
if(x.stage!==expected)throw Error('CLEANUP_WRONG_STAGE');
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/scripts/'+expected+'/subdomain',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({enabled:false,previews_enabled:false}),signal:AbortSignal.timeout(30000)});
const j=await r.json();
if(!r.ok||!j.success)throw Error('STAGING_DISABLE_FAILED:'+r.status+':'+JSON.stringify(j.errors));
await writeFile(D+'/qa/stage-disabled.json',JSON.stringify({ok:true,stage:expected,subdomainEnabled:false,productionWrites:0},null,2));
console.log('STAGING_SUBDOMAIN_DISABLED '+JSON.stringify({stage:expected,ok:true}));
