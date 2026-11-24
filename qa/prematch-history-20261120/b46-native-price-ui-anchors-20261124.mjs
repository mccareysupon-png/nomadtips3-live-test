import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,acc=process.env.CLOUDFLARE_ACCOUNT_ID;
const root='https://api.cloudflare.com/client/v4/accounts/'+acc+'/workers';
async function get(p){const r=await fetch(root+p,{headers:{authorization:'Bearer '+token}}),j=await r.json();assert(r.ok&&j.success);return j.result}
const worker='ball46-premium-match-colors-test-20261120';
const ver=(await get('/scripts/'+worker+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const installed=await get('/workers/'+worker+'/versions/'+ver+'?include=modules');
const main=Buffer.from(installed.modules.find(x=>x.name===installed.main_module).content_base64,'base64').toString();
const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const client=JSON.parse(main.match(rx)[1]);
const hits=[
 ['MAIN_FRONT_ROUTE',main,'var worker_default = { async fetch(req, env) {',1800],
 ['MAIN_PREMATCH_STORE',main,'env.PREMATCH_STORE',1150],
 ['MAIN_PREMATCH_DATA',main,'/__b46_prematch_data',900],
 ['CLIENT_DRAW_FINISH',client,'const finish=()=>{',2800],
 ['CLIENT_OU_RENDER',client,'const activeLedger=mode===\\'ou\\'',1400],
 ['CLIENT_FOOTER',client,'if(document.readyState',1000]
];
console.log('B46_NATIVE_INSERT_INSPECT '+JSON.stringify({version:ver,
 hits:hits.map(([name,code,needle,length])=>{const i=code.indexOf(needle);return{name,index:i,sample:i>=0?code.slice(Math.max(0,i-250),i+length):''}})}).slice(0,20000));
