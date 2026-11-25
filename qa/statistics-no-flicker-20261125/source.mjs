import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const d=await fetch(api+'/scripts/ball46-production/deployments?per_page=1',{headers:{authorization:'Bearer '+token}}).then(r=>r.json());
const version=d.result.deployments[0].versions[0].version_id;
const r=await fetch(api+'/workers/ball46-production/versions/'+version+'?include=modules',{headers:{authorization:'Bearer '+token}}),j=await r.json();
assert(j.success,'CF_READ_FAILED');
const modules=j.result.modules;
for(const m of modules){if(!m.content_base64)continue;
 const code=Buffer.from(m.content_base64,'base64').toString();
 const terms=['data-b46-range','f46-buttons','b46-range','f46-','longterm-performance-343.js'];
 const found=terms.map(term=>{let n=0,p=0,a=[];while((p=code.indexOf(term,p))>=0){n++;if(a.length<5)a.push({at:p,excerpt:code.slice(Math.max(0,p-500),p+800)});p+=term.length;}return {term,n,samples:a}}).filter(x=>x.n);
 if(found.length)console.log('B46_STAT_MODULE_MATCH '+JSON.stringify({module:m.name,bytes:code.length,found}));
}
console.log('B46_STAT_MODULE_TOTAL '+JSON.stringify({version,modules:modules.length}));
