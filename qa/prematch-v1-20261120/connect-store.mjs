import assert from 'node:assert/strict';
const ui='ball46-prematch-ui-test-v5-20261120',store='ball46-prematch-only-test-20261120',prod='ball46-production';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',token=process.env.CLOUDFLARE_API_TOKEN;
async function cf(p,o={}){const r=await fetch(root+p,{...o,headers:{authorization:'Bearer '+token,...o.headers},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
async function ver(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
const before=await ver(prod),old=await ver(ui),sub=(await cf('/subdomain')).subdomain,url='https://'+ui+'.'+sub+'.workers.dev';
const v=await cf('/workers/'+ui+'/versions/'+old+'?include=modules');
const mod=v.modules.find(x=>x.name===v.main_module);assert(mod?.content_base64);
const src=Buffer.from(mod.content_base64,'base64').toString();
const marker=';export default';const i=src.indexOf(marker);assert(src.startsWith('const files=')&&i>0);
const files=JSON.parse(src.slice('const files='.length,i));
const client=`<script>
(async()=>{const caption=document.querySelector('#pm-caption'),card=document.querySelector('#pm-card'),empty=document.querySelector('#pm-empty');card.replaceChildren();card.hidden=true;caption.textContent='Loading Pre-Match data…';try{const r=await fetch('/prematch-data',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();const rows=d.selection?.rows||[];const picks=rows.flatMap(x=>(x.picks||[]).map(p=>({fixture:x.fixtureId,pick:p})));caption.textContent='5USD · '+d.stored.finished+' finished results · '+d.teamsWith10+' teams with 10 matches · '+rows.length+' candidates';const count=document.querySelector('[data-pm="status-prematch"] .pm-value');if(count)count.textContent=picks.length;const msg=document.createElement('p');msg.textContent=picks.length?'Qualified Pre-Match predictions: '+picks.length:'No qualified predictions yet. '+(!d.selection?'Upcoming analysis not connected.':'Check history coverage and selection rules.');card.append(msg);for(const x of picks){const p=document.createElement('div');p.className='pm-pick';p.textContent=x.fixture+' · '+JSON.stringify(x.pick);card.append(p)}card.hidden=false;}catch(e){caption.textContent='Pre-Match data unavailable: '+e.message;card.hidden=true}})();
</script>`;
for(const p of ['/','/index.html']){let html=files[p].body;const start=html.indexOf('<div id="pm-card"'),end=html.indexOf('<div id="pm-empty"',start);assert(start>=0&&end>start);html=html.slice(0,start)+'<div id="pm-card" class="pm-card" hidden></div>'+html.slice(end);files[p].body=html.replace('</body>',client+'</body>');assert(!files[p].body.includes('DEMO FIXTURE'))}
let worker='const files='+JSON.stringify(files)+src.slice(i);
worker=worker.replace('async fetch(req){','async fetch(req,env){if(req.method==="GET"&&new URL(req.url).pathname==="/prematch-data"){return env.PREMATCH_STORE.fetch("https://prematch.internal/preview-data");}');
worker=worker.replace("connect-src \\'none\\'","connect-src \\'self\\'");
assert(worker.includes('connect-src')&&worker.includes('PREMATCH_STORE.fetch'));
const form=new FormData();form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-19',bindings:[{name:'PREMATCH_STORE',type:'service',service:store,environment:'production'}]})],{type:'application/json'}),'metadata.json');form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
await cf('/scripts/'+ui,{method:'PUT',body:form});
let data;for(let n=0;n<20;n++){try{const r=await fetch(url+'/prematch-data');if(r.ok){data=await r.json();if(data.stored?.finished>=113)break}}catch{}await new Promise(r=>setTimeout(r,1500))}
assert(data?.stored?.finished>=113,'UI_DATA_UNREACHABLE');const page=await fetch(url);assert(page.ok&&!(await page.text()).includes('DEMO FIXTURE'));assert.equal(await ver(prod),before);
console.log('PREMATCH_UI_CONNECTED '+JSON.stringify({url,stored:data.stored,teams:data.teams,teamsWith10:data.teamsWith10,selection:data.selection,productionUnchanged:true}));
