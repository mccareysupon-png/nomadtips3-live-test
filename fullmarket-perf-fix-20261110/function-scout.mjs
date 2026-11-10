import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();assert(r.ok&&j.success);return j.result}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=2`),id=d.deployments[0].versions[0].version_id,v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
console.log('ACTIVE='+id);
const m=v.modules.find(x=>x.name===v.main_module)||v.modules.find(x=>x.name==='index.js');assert(m,'MAIN_MISSING');
const t=Buffer.from(m.content_base64,'base64').toString('utf8');
for(const key of ['function __b46BetssonBookmakerAsset','const __b46BetssonBookmakerAsset','let __b46BetssonBookmakerAsset','var __b46BetssonBookmakerAsset','__b46BetssonBookmakerAsset=','NOMAD343_FULL_MARKET_BOOKMAKER','function inspectFixture(f)','function renderBookHtml(f','function update(expanded,fixture)']){
 let p=0,c=0;
 while(true){const i=t.indexOf(key,p);if(i<0)break;console.log('\nKEY='+key+' POS='+i);console.log(t.slice(Math.max(0,i-4000),Math.min(t.length,i+16000)));p=i+key.length;if(++c>=5)break}
}
