import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {classifyProviderPath,makeProviderBridge,forwardProvider} from './provider-bridge.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
async function read(name){const id=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;const v=await cf('/workers/'+name+'/versions/'+id+'?include=modules');const m=v.modules.find(x=>x.name===v.main_module)||v.modules.find(x=>x.name.endsWith('.js'));return {id,source:Buffer.from(m.content_base64,'base64').toString(),module:m.name,modules:v.modules};}
function replaceOnce(s,needle,replacement){assert.equal(s.split(needle).length,2,'SOURCE_ANCHOR_CHANGED '+needle.slice(0,70));return s.replace(needle,replacement)}
// Only replace provider transport, not a scoring, price, settlement or signal expression.
function patchEngine(s){
 const start=s.indexOf('async function fetchVerifiedCornerOnly(');assert(start>=0);
 const end=s.indexOf('\n}',start);assert(end>start);
 let f=s.slice(start,end+2);assert(f.includes('api.5dollarfootballapi.com'));
 const lines=f.split('\n');const index=lines.findIndex(l=>l.includes('const response=await fetch(url,'));assert(index>=0&&lines.filter(l=>l.includes('await fetch(')).length===1);
 lines[index]='  const response=await forwardProvider(env,"referee",url);';
 f=lines.join('\n');return 'import {forwardProvider} from "./provider-bridge.mjs";\n'+s.slice(0,start)+f+s.slice(end+2);
}
function patchMarket(s){
 const start=s.indexOf('async function providerRequest(fixtureId, key) {');assert(start>=0);const end=s.indexOf('\n}',start);assert(end>start);
 let f=s.slice(start,end+2);f=replaceOnce(f,'async function providerRequest(fixtureId, key) {','async function providerRequest(fixtureId, key, env) {');
 const a=f.indexOf('await fetch(');assert(a>=0);
 // Locate the exact fetch call using balanced parentheses and quoted text.
 let depth=0,quote=null,escaped=false,b=-1;for(let i=a+'await fetch'.length;i<f.length;i++){const c=f[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue}if(c==='"'||c==="'"||c.charCodeAt(0)===96){quote=c;continue}if(c==='(')depth++;else if(c===')'&&--depth===0){b=i+1;break}}
 assert(b>a,'FETCH_EXPRESSION_NOT_LOCATED');f=f.slice(0,a)+'await forwardProvider(env,"fullmarket",url)'+f.slice(b);
 let out=s.slice(0,start)+f+s.slice(end+2);out=replaceOnce(out,'await providerRequest(fixtureId, this.env.FIVEDOLLAR_API_KEY)','await providerRequest(fixtureId, this.env.FIVEDOLLAR_API_KEY, this.env)');return 'import {forwardProvider} from "./provider-bridge.mjs";\n'+out;
}
const engines=['nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-5usd-hub-343'];const before={};
for(const n of engines)before[n]=await read(n);
const e=before[engines[0]],m=before[engines[1]];
// The production engine's active spec defines exact market slugs. Extract only
// quoted safe identifiers in its local helper; log no secrets or full source.
const corner=e.source.match(/function cornerHistorySpec\([\s\S]{0,2500}?\n\}/)?.[0]??'';
const slugs=[...new Set([...corner.matchAll(/market\s*:\s*["']([A-Za-z0-9_-]+)["']/g)].map(x=>x[1]))];console.log('CORNER_MARKET_SPEC',JSON.stringify({slugs,found:!!corner}));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'b46-caller-'));
try{
 for(const [name,source] of [['engine.mjs',patchEngine(e.source)],['market.mjs',patchMarket(m.source)]]){await fs.writeFile(path.join(tmp,name),source);const r=spawnSync(process.execPath,['--check',path.join(tmp,name)],{encoding:'utf8'});assert(r.status===0,'PATCH_SYNTAX '+name+' '+String(r.stderr).slice(0,250));}
 // Verify the actual spec slugs accepted before any cutover.
 const allowed=slugs.map(s=>{try{classifyProviderPath('referee','/v1/fixtures/123/odds/history?market='+s+'&bookmaker=bet365&per_page=500',Math.floor(Date.now()/1000));return {market:s,accepted:true}}catch{return {market:s,accepted:false}}});
 const after={};for(const n of engines)after[n]=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const unchanged=engines.every(n=>after[n]===before[n].id);assert(unchanged);
 const result={engineTransformSyntax:true,fullMarketTransformSyntax:true,exactMarketSlugs:allowed,allKnownMarketsAccepted:allowed.length>0&&allowed.every(x=>x.accepted),unchanged,providerRequests:0,productionDeployment:false,scope:'SOURCE_TRANSFORM_ONLY'};
 console.log('CLIENT_CUTOVER_SHADOW',JSON.stringify(result));
}finally{await fs.rm(tmp,{recursive:true,force:true})}
