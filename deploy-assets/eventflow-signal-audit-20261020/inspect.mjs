import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
if(!ACCOUNT||!TOKEN)throw Error('CLOUDFLARE_INSPECTION_CREDENTIALS_MISSING');
const SCRIPT='ball46-production';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function request(url,cloudflare=false){
 const response=await fetch(url,{headers:cloudflare?{Authorization:'Bearer '+TOKEN,accept:'application/json'}:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(50000)});
 const text=await response.text();
 if(!response.ok)throw Error('HTTP_'+response.status+' '+new URL(url).pathname);
 return text;
}
const prefix='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const d=JSON.parse(await request(prefix+'/workers/scripts/'+SCRIPT+'/deployments?per_page=1',true));
if(!d.success)throw Error('CF_READ_FAILED');
const active=d.result?.deployments?.[0];
if(!active||active.versions?.length!==1||active.versions[0].percentage!==100)throw Error('ACTIVE_IS_NOT_ONE_100_PERCENT_VERSION');
const versionId=active.versions[0].version_id;
const paths=['/','/index.html','/app.css','/dashboard-v2-tune.css','/singlepage-workspace-343.js','/expanded-match-343.js'];
const patterns=[
 {name:'signal_card_classes',re:/[.#][\w-]*(?:signal|flow|entry|card|ribbon|badge|pill)[\w-]*/gi},
 {name:'eventflow_signal_context',re:/SIGNAL|CORNER TOTAL|signal-entry|signal-badge|signal-pill|signal-chip|event.flow|detail-flow/gi},
];
function excerpts(body,pattern,max){
 const result=[],seen=new Set();pattern.lastIndex=0;let match;
 while((match=pattern.exec(body))&&result.length<max){
  const a=Math.max(0,match.index-140),b=Math.min(body.length,match.index+250),slice=body.slice(a,b).replace(/\s+/g,' ');
  if(!seen.has(slice)){seen.add(slice);result.push(slice);}
  if(match.index===pattern.lastIndex)pattern.lastIndex++;
 }
 return result;
}
const report={worker:SCRIPT,activeVersion:versionId,activeDeployment:active.id,readOnly:true,readAt:new Date().toISOString(),assets:{}};
for(const path of paths){
 const base='https://ball46.com'+path,sep=base.includes('?')?'&':'?';
 const body=await request(base+sep+'eventflow_audit='+Date.now());
 const rec={bytes:Buffer.byteLength(body),sha256:sha(body),markers:[...new Set(body.match(/b46-[a-z0-9-]+-20261020/g)||[])].slice(-45)};
 if(path.endsWith('.js')||path.endsWith('.css')){
  rec.signalContext=excerpts(body,patterns[1].re,22);
  rec.signalClasses=[...new Set((body.match(/[.#][\w-]*(?:signal|flow|entry|card|ribbon|badge|pill)[\w-]*/gi)||[]))].slice(0,85);
 }else{
  rec.signalContext=excerpts(body,patterns[1].re,9);
 }
 if(path==='/expanded-match-343.js'){
  rec.signalRender=excerpts(body,/signalAnnotationLines\s*\(|signalMarkers\s*\(|flow-marker|flow-signal|signal-annotation|signal-entry|signal-badge|<rect|foreignObject|SIGNAL[^A-Za-z]/gi,62);
}
if(path==='/'||path==='/index.html'||path==='/dashboard-v2-tune.css'||path==='/app.css'){
  rec.flowCss=excerpts(body,/\.expand-flow-[\w-]+|\.b46-eventflow-[\w-]+|\.signal-annotation[\w-]*|\.signal-marker[\w-]*|\.flow-signal[\w-]*|\.signal-entry[\w-]*/gi,45);
}
report.assets[path]=rec;
}
const v=JSON.parse(await request(prefix+'/workers/workers/'+SCRIPT+'/versions/'+versionId+'?include=modules',true));
if(!v.success)throw Error('CF_VERSION_READ_FAILED');
const modules=v.result?.modules||[];
report.modules=modules.map(m=>({name:m.name,bytes:Buffer.from(m.content_base64||'','base64').length,sha256:sha(Buffer.from(m.content_base64||'','base64'))}));
const main=modules.find(m=>m.name===v.result.main_module);
if(main){
 const workerSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 report.workerMarkers=[...new Set(workerSource.match(/b46-[a-z0-9-]+-20261020/g)||[])].slice(-60);
 report.workerSignalContext=excerpts(workerSource,patterns[1].re,25);
}
mkdirSync('audit',{recursive:true});
writeFileSync('audit/eventflow-signal-report.json',JSON.stringify(report,null,2));
console.log('READ_ONLY_BALL46_ACTIVE_VERSION',versionId);
for(const [p,a] of Object.entries(report.assets)){
 console.log('ASSET',p,a.bytes,a.sha256,'classes',JSON.stringify((a.signalClasses||[]).slice(0,30)));
 for(const x of (a.signalContext||[]).slice(0,p.includes('singlepage')?10:5))console.log('SNIPPET',p,x.slice(0,230));
}
for(const [p,a] of Object.entries(report.assets)){
 for(const x of (a.signalRender||[]).slice(0,45))console.log('RENDER',p,x.slice(0,450));
 for(const x of (a.flowCss||[]).slice(0,30))console.log('FLOWCSS',p,x.slice(0,400));
}
console.log('WORKER_MARKERS',JSON.stringify(report.workerMarkers||[]));
console.log('EVENTFLOW_SIGNAL_READ_ONLY_AUDIT_SUCCESS');
