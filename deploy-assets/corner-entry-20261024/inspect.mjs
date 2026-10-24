import{mkdir,writeFile}from'node:fs/promises';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
if(!A||!T)throw Error('CLOUDFLARE_CREDENTIALS_MISSING');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(50000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,200));return j.result}
async function pub(path){const r=await fetch('https://ball46.com'+path,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(60000)}),t=await r.text();return {status:r.status,type:r.headers.get('content-type'),body:t}}
const out={at:new Date().toISOString(),workers:[],data:{},js:[],html:[]};
for(const w of['ball46-production','nomadtips3-engine-343']){
 const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments?.[0],active=d.versions.find(x=>x.percentage===100)?.version_id;
 const v=await cf('/workers/workers/'+w+'/versions/'+active+'?include=modules');
 const source=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 const targetTerms=w==='ball46-production'?['function signalDetailsHtml','function newFeatureSignalParts','function patchFeatureSignalHost','function signalParts(host)','b46-featured-faithful-v11','signal-entry','Entry 0','entryScore','entryCorners','cornerEntry','entryCorner','function corner']:['entryCorners','entryCorner','cornerEntry','entryStats','entrySnapshot','function buildSignal','function createSignal','entryScore','entryStatistics','cornerAtEntry','entryStats'];
 const matches=[];for(const term of targetTerms){let i=-1,n=0;while((i=source.indexOf(term,i+1))>=0&&n++<3)matches.push({term,offset:i,text:source.slice(Math.max(0,i-320),i+term.length+1550)})}
 out.workers.push({worker:w,active,deployment:d.id,main:v.main_module,moduleCount:v.modules.length,sourceLength:source.length,matches});
}
const js=await pub('/dashboard-v2-stage3-featured-facts-20261013a.js?checkCornerEntry='+Date.now());
out.jsStatus=js.status;out.jsLength=js.body.length;
for(const term of['function signalDetailsHtml','function newFeatureSignalParts','function patchFeatureSignalHost','entryScore','entryCorners','cornerEntry','entryCorner','function signalParts','feature-signal-meta']){let i=-1,n=0;while((i=js.body.indexOf(term,i+1))>=0&&n++<4)out.js.push({term,offset:i,text:js.body.slice(Math.max(0,i-350),i+term.length+1650)});}
const html=await pub('/?checkCornerEntry='+Date.now());out.htmlStatus=html.status;
for(const term of['b46-featured-faithful-v11','signalParts(host)','data-v11-kind','data-v11-value']){let i=-1,n=0;while((i=html.body.indexOf(term,i+1))>=0&&n++<2)out.html.push({term,offset:i,text:html.body.slice(Math.max(0,i-260),i+term.length+1600)})}
for(const p of ['/api/engine/signals','/api/engine/board']){
 try{const r=await pub(p+'?cornerEntryAudit='+Date.now()),j=JSON.parse(r.body);const signals=(j.signals||[]);out.data[p]={status:r.status,keys:Object.keys(j),total:signals.length,markets:signals.reduce((o,s)=>(o[s.market]=(o[s.market]||0)+1,o),{}),corners:signals.filter(s=>/corner/i.test(String(s.market))).slice(0,4),sample:signals.slice(0,2)};
 if(p.endsWith('/board')){out.data[p].fixtures=j.fixtures?.length;out.data[p].boardSample=j.fixtures?.filter(f=>f.signals?.length||f.analysis?.ft_corner_over?.state==='PASS').slice(0,2).map(x=>({keys:Object.keys(x),signals:x.signals?.slice(0,2),fixtureId:x.fixtureId}));}}
 catch(e){out.data[p]={error:String(e.message||e)}}
}
await mkdir('audit',{recursive:true});await writeFile('audit/production-corner-entry.json',JSON.stringify(out,null,2));
console.log('CORNER_ENTRY_AUDIT='+JSON.stringify({at:out.at,workers:out.workers.map(w=>({...w,matches:w.matches.slice(0,10).map(z=>({...z,text:z.text.slice(0,1200)}))})),js:out.js.slice(0,15).map(x=>({...x,text:x.text.slice(0,1350)})),html:out.html.slice(0,5).map(x=>({...x,text:x.text.slice(0,1000)})),data:out.data}).slice(0,45000));
