import fs from 'node:fs';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
const {parse}=await import(pathToFileURL(process.env.ACORN_ENTRY).href);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',prod='ball46-production';
async function api(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(50000)});const j=await r.json();if(!r.ok||!j.success)throw Error(p+' '+r.status);return j.result}
async function pub(p,base='https://ball46.com'){const r=await fetch(new URL(p,base),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(p+' '+r.status);return r.text()}
const id=(await api('/scripts/'+prod+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await api('/workers/'+prod+'/versions/'+id+'?include=modules');
console.log('PROD_VERSION '+JSON.stringify({id,main:v.main_module,modules:v.modules.map(m=>m.name),compat:v.compatibility_date}));
fs.mkdirSync('audit',{recursive:true});
const paths=['/index.html?view=statistics','/longterm-performance-343.js','/b46-statistics-card-20261116.js','/b46-statistics-fast-v1-20261116.js','/b46-statistics-columns-20261102.js','/b46-statistics-card-20261116.css'];
const html=await pub(paths[0]);fs.writeFileSync('audit/public.html',html);
const refs=[...html.matchAll(/(?:src|href)=["']([^"']*(?:longterm-performance|b46-statistics-card|b46-statistics-fast-v1|b46-statistics-columns|winrate|win-rate)[^"']*)["']/ig)].map(x=>x[1]);console.log('HTML_ASSET_REFS '+JSON.stringify(refs));
const pubSources={};
for(const p of paths.slice(1)){const ref=refs.find(x=>new URL(x,'https://ball46.com').pathname===p)||p;try{const s=await pub(ref);pubSources[p]=s;fs.writeFileSync('audit/'+p.slice(1),s);console.log('PUBLIC '+JSON.stringify({p,ref,sha:sha(s),length:s.length}))}catch(e){console.log('PUBLIC_ERROR '+e)}}
const needles=['function renderFromStats(s,source){','function enhanceFilteredMarket(){','const overview=chart?.querySelector','state=c.settled?c.res','<span>PUSH</span><strong data-sp-kpi="push">','function makeCard(item){','b46-statistics-card-20261116.js','b46-statistics-fast-v1-20261116.js','b46-statistics-card-20261116.css','longterm-performance-343.js','b46-statistics-columns-20261102.js','b46-stage-summary-grid','b46-v1-market-detail'];
for(const m of v.modules){if(!/\.m?js$/.test(m.name))continue;const s=Buffer.from(m.content_base64,'base64').toString();const hits=needles.filter(n=>s.includes(n));console.log('MODULE '+JSON.stringify({name:m.name,sha:sha(s),size:s.length,hits}));if(!hits.length)continue;
 let ast;try{ast=parse(s,{ecmaVersion:'latest',sourceType:'module'})}catch(e){console.log('PARSE_ERROR '+m.name+' '+e);continue}
 const found=[];
 function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Literal'&&typeof n.value==='string'&&n.value.length>100){const h=needles.filter(k=>n.value.includes(k));const matches=Object.entries(pubSources).filter(([p,x])=>x===n.value).map(([p])=>p);if(h.length||matches.length){const name=m.name.replaceAll('/','_')+'-'+n.start;fs.writeFileSync('audit/'+name+'.txt',n.value);found.push({name,start:n.start,end:n.end,len:n.value.length,hash:sha(n.value),hits:h,matches,head:n.value.slice(0,110)})}}
 for(const [k,val]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(val))val.forEach(walk);else if(val&&typeof val==='object')walk(val)}}
 walk(ast);console.log('LITERALS '+JSON.stringify({module:m.name,found}));
 // Save relevant module source only to private workflow artifact; prevent spilling secret bindings.
 if(hits.some(x=>x.includes('.js')||x.includes('.css')))fs.writeFileSync('audit/module-'+m.name.replaceAll('/','_')+'.txt',s);
}
console.log('HTML_ANCHORS '+JSON.stringify(needles.map(n=>[n,html.split(n).length-1])));
