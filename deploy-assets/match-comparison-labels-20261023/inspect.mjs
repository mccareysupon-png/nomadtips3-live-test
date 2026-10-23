import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ORIGIN='https://ball46.com';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw Error('MISSING_CREDS');
const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token}});
const j=await response.json();if(!response.ok||!j.success)throw Error('CF_API_FAILURE');
const active=j.result.deployments[0];
const get=async(path)=>{const u=new URL(path,ORIGIN);u.searchParams.set('compareLabelsAudit',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(40000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),text:b.toString(),type:r.headers.get('content-type')};};
const h=await get('/');
const scripts=[...h.text.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(x=>x[1]);
const terms=/MATCH COMPARISON|match comparison|LIVE STATS|live stats|comparison|compareHome|compareAway|team-label|home-name|away-name|homeLabel|awayLabel/gi;
function match(s,n=16){const out=[];let m;terms.lastIndex=0;while((m=terms.exec(s))&&out.length<n)out.push({token:m[0],index:m.index,text:s.slice(Math.max(0,m.index-550),Math.min(s.length,m.index+850))});return out;}
const out={time:new Date().toISOString(),activeVersion:active.versions[0].version_id,activeDeployment:active.id,rootSha:h.sha,rootStatus:h.status,htmlMatches:match(h.text,30),scripts:[]};
for(const p of scripts){try{const s=await get(p);let m=match(s.text,8);if(m.length)out.scripts.push({path:p,sha:s.sha,bytes:s.text.length,matches:m});}catch(e){out.scripts.push({path:p,error:String(e)})}}
await mkdir('audit',{recursive:true});await writeFile('audit/live-inspection.json',JSON.stringify(out,null,2));

const tokens=['b46v11-legend','data-v12-home','data-v12-away','feature-stats::before','feature-stats::after','feature-stats >','feature-stats>'];
const focused={};
for(const token of tokens){let i=-1,a=[];while((i=h.text.indexOf(token,i+1))>=0&&a.length<12)a.push({index:i,slice:h.text.slice(Math.max(0,i-360),Math.min(h.text.length,i+token.length+750))});focused[token]=a;}
console.log('B46_LABELS_FOCUSED='+JSON.stringify({version:out.activeVersion,rootSha:out.rootSha,focused}).slice(0,26000));
