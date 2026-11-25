import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const name='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)});const j=await r.json();assert(r.ok&&j.success,path+'_'+r.status);return j.result;}
const deploy=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0];
const version=deploy.versions[0].version_id;
const v=await cf('/workers/'+name+'/versions/'+version+'?include=modules');
const modules=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const main=modules[v.main_module],p=main.lastIndexOf('export default ');
console.log('B46_OU_NOV25_CRON_LATEST '+JSON.stringify({version,createdOn:deploy.created_on,mainModule:v.main_module,
 handler:main.slice(p,p+5200),scheduledTokenCount:(main.match(/prematch-ou-engine-tick/g)||[]).length,
 engineImport:(main.match(/import .*PREMATCH_OU.*from.*;/g)||[]),scriptChars:main.length}));
const marks=['async runPreMatchOuEngine(now)','async runPreMatchOuEngine','runPreMatchOuEngine(now)','prematch-ou-engine-tick','PREMATCH_OU_ENGINE_TEST_ERR','PREMATCH_OU_ENGINE_TEST status=','PREMATCH_EXTRA_PROVIDER_CYCLE_DISABLED'];
for(const needle of marks){let places=[],i=-1;while((i=main.indexOf(needle,i+1))>=0&&places.length<4)places.push(main.slice(Math.max(0,i-210),i+820));console.log('B46_OU_NOV25_CODE '+JSON.stringify({needle,places}).slice(0,4500));}
