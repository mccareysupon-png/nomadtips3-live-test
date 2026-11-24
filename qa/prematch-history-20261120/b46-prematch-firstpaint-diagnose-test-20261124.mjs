// READONLY diagnostic of active BALL46 PreMatch TEST loading UI.
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_SECRETS_MISSING');
const name='ball46-premium-match-colors-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function get(path){
 const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status);return j.result;
}
const deployments=await get('/scripts/'+name+'/deployments?per_page=1');
const id=deployments.deployments[0].versions[0].version_id;
const deployed=await get('/workers/'+name+'/versions/'+id+'?include=modules');
const modules=Object.fromEntries(deployed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const worker=modules[deployed.main_module];
const m=worker.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(m,'CLIENT_EMBED_NOT_FOUND');
const client=JSON.parse(m[1]);
const patterns=[
 'loading','Loading','spinner','skeleton','placeholder','overlay','mask','splash',
 'DOMContentLoaded','document.readyState','fetch(','async function','function render(',
 'function renderPreMatch','const finish=()=>{','const routes = [','panel.innerHTML','panel.replaceChildren',
 'function navigate','function goTo','popstate','navRow(','fetchData','isLoading',
 'renderEmptyOuScreen','b46PrematchLastScrollRoute'
];
for(const text of patterns){
 const spots=[];let i=0;
 while((i=client.indexOf(text,i))!==-1){spots.push(i);i+=text.length;if(spots.length>=9)break}
 if(!spots.length)continue;
 console.log('B46_UI_SOURCE_INSPECT '+JSON.stringify({term:text,count:spots.length,parts:spots.slice(0,5).map(i=>client.slice(Math.max(0,i-280),Math.min(client.length,i+690)))}));
}
const urls=['/?b46pm=predictions','/?b46pm=ou','/?b46pm=btts'];
for(const path of urls){
 const resp=await fetch('https://'+name+'.mccarey-supon.workers.dev'+path,{cache:'no-store',signal:AbortSignal.timeout(18000)});
 const html=await resp.text();
 console.log('B46_UI_HTML_INSPECT '+JSON.stringify({path,status:resp.status,length:html.length,
  head:html.slice(0,1600),body:html.slice(-4000).replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'<script REMOVED />').slice(-1400)}));
}

const focus=[
 ['worker','data-b46-pm-boot',worker],
 ['worker','prematchClientScript',worker],
 ['worker','__b46_prematch_client.js',worker],
 ['client','const start=()=>{',client],
 ['client','function show(',client],
 ['client','function restore(',client],
 ['client','function draw(',client],
 ['client','async function load(){',client],
 ['client','function ensure(){',client],
 ['client','const panel=',client],
 ['client','function readRoute(',client],
 ['client','function b46AdaptivePanel(',client],
 ['client','function syncPrematchViewport(',client]
];
for(const [where,needle,src] of focus){
 const index=src.indexOf(needle);
 if(index>=0)console.log('B46_UI_FOCUS '+JSON.stringify({where,needle,index,sample:src.slice(Math.max(0,index-500),Math.min(src.length,index+5500))}));
}

console.log('B46_UI_INSPECTION_DONE '+JSON.stringify({id,clientSize:client.length,workerSize:worker.length}));
