import{mkdir,writeFile}from'node:fs/promises';
const ACC=process.env.CLOUDFLARE_ACCOUNT_ID,TOK=process.env.CLOUDFLARE_API_TOKEN;if(!ACC||!TOK)throw Error('NO_CREDS');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACC+p,{headers:{Authorization:'Bearer '+TOK},signal:AbortSignal.timeout(35000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF'+r.status);return j.result;}
const host='nomadtips3-5usd-hub-343',v=(await cf('/workers/scripts/'+host+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const ver=await cf('/workers/workers/'+host+'/versions/'+v+'?include=modules');const src=Buffer.from(ver.modules.find(x=>x.name===ver.main_module).content_base64,'base64').toString();
const clean=s=>s.replace(/(?:\b(?:key|token|secret|bearer|authorization|password)\b[\s:="']+)[^\s,'"}]{10,}/ig,'[redacted]').replace(/[A-Za-z0-9+/]{80,}/g,'[redacted]');
const tokens=['function providerOddsRaw','function normalize(','async refreshToday(','async refreshLive(','async callProvider','async fetchProvider','function apiGet','function providerGet','API_BASE','/fixtures','/matches','/odds','getOdds','RichOddsGate','async loadRich(','function viewerBlockedResponse','if (url.pathname === "/rich-odds")'];
let sample={version:v,codeLength:src.length,functions:[],apiStrings:[]};
for(const token of tokens){let i=-1,loops=0;while((i=src.indexOf(token,i+1))>=0&&loops++<2){sample.functions.push({token,at:i,text:clean(src.slice(Math.max(0,i-100),Math.min(src.length,i+3100))).slice(0,3100)});}}
const regexp=/(?:https:\/\/api\.5dollarfootballapi\.com\/v1|API_BASE)[^;\n]{0,250}/g;sample.apiStrings=[...src.matchAll(regexp)].slice(0,13).map(x=>clean(x[0]));
const req=await cf('/workers/scripts/'+host+'/settings');sample.bindings=(req.bindings||[]).map(b=>({type:b.type,name:b.name,service:b.service,environment:b.environment}));
// These requests serve cached DO health/snapshot; they do not perform upstream rich odds fetches.
const urls=['https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health','https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot'];
sample.cache={};
for(const url of urls){try{const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(16000)}),txt=await r.text();sample.cache[url.includes('health')?'health':'snapshot']={status:r.status,contentType:r.headers.get('content-type'),bytes:txt.length};if(r.status===200&&txt.startsWith('{')){const j=JSON.parse(txt);const key=url.includes('health')?'health':'snapshot';
sample.cache[key].topKeys=Object.keys(j).slice(0,30);
if(key==='health')sample.cache[key].data=Object.fromEntries(Object.entries(j).filter(([k])=>!['control'].includes(k)));
if(key==='snapshot'){const arr=Array.isArray(j.fixtures)?j.fixtures:Array.isArray(j.rows)?j.rows:Array.isArray(j.data)?j.data:[];sample.cache[key].fixtureCount=arr.length;sample.cache[key].firstFixtureKeys=Object.keys(arr[0]||{});sample.cache[key].oddsKeys=Object.keys(arr[0]?.providerOdds||{});sample.cache[key].bttsCount=arr.filter(f=>JSON.stringify(f.providerOdds||f.odds||{}).toLowerCase().includes('"btts"')).length;}
}}catch(e){sample.cache[url.includes('health')?'health':'snapshot']={error:String(e.message||e).slice(0,200)}}}
await mkdir('audit',{recursive:true});await writeFile('audit/hub-raw-route-audit.json',JSON.stringify(sample,null,2));
const brief={version:sample.version,codeLength:sample.codeLength,apiStrings:sample.apiStrings,bindings:sample.bindings,cache:sample.cache,functions:sample.functions.map(x=>({token:x.token,at:x.at,text:x.text.slice(0,['function providerOddsRaw','function normalize(','async refreshToday(','async refreshLive(','function viewerBlockedResponse'].includes(x.token)?1700:900)}))};
console.log('BTTS_5USD_HUB_PROOF='+JSON.stringify(brief).slice(0,20000));
