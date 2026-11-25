import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,name='ball46-premium-match-colors-test-20261120';
assert(token&&account);
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function get(path){const r=await fetch(root+path,{headers:{authorization:'Bearer '+token}}),d=await r.json();assert(r.ok&&d.success,JSON.stringify(d.errors||[]));return d.result;}
const deployment=await get('/scripts/'+name+'/deployments?per_page=1'),id=deployment.deployments[0].versions[0].version_id;
const ver=await get('/workers/'+name+'/versions/'+id+'?include=modules');
const src=Buffer.from(ver.modules.find(m=>m.name===ver.main_module).content_base64,'base64').toString();
const main=src.slice(src.indexOf('  if (u.pathname === "/__b46_prematch_client.js")'),src.lastIndexOf('  const headers = new Headers();'));
const routes=[...src.matchAll(/u\.pathname\s*===?\s*["']([^"']+)["']/g)].map(x=>x[1]);
const clientMatch=src.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);assert(clientMatch);
const client=JSON.parse(clientMatch[1]);
const fetches=[...client.matchAll(/\bfetch\(\s*['"]([^'"]+)['"]/g)].map(x=>x[1]);
console.log('B46_UNIFIED_ROUTES '+JSON.stringify({version:id,markers:{perf:client.includes('B46_PERFORMANCE_RANGE_INPLACE_20261125'),equity:client.includes('B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125')},routes:[...new Set(routes)].filter(x=>x.startsWith('/__b46')),fetches:[...new Set(fetches)].filter(x=>x.startsWith('/')),delegate:src.slice(src.indexOf('const r = await env.B46_PRODUCTION_READ.fetch'),src.indexOf('const r = await env.B46_PRODUCTION_READ.fetch')+900),prefix:main.slice(0,2800)}));
