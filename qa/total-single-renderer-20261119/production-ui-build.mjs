import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {patchFinance,patchVisual} from './patch.mjs';
import {patchAll,wdlCSS} from './presentation-all-markets.mjs';
import {patchRate,patchNativeHtml,rateCSS} from './win-rate-tone.mjs';
export const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
export const tag='b46-statistics-ui-20261119-v1',cssPath='/'+tag+'.css',entry='statistics-ui-entry-20261119.mjs',payload='statistics-ui-payload-20261119.mjs';
export const origin='https://ball46.com',assetPaths={finance:'/longterm-performance-343.js',visual:'/b46-statistics-card-20261116.js',fast:'/b46-statistics-fast-v1-20261116.js',columns:'/b46-statistics-columns-20261102.js'};
const expected={finance:'29e09c10270f1a4e849f94de011362cbf82cf20524f69946ca819061cce72590',visual:'aae0dcb8a119554038c933f0bac8696b56ae4dac1b897a388ad87190841ae59b',fast:'503e6a05298d8e9abf2b3710601dab228b95d4db07701b802d02f6c4a8bb913b',columns:'413437e50211b7debaadb3d474eef3d8c1db8733557c816dd9422787432d4ada'};
function getRefs(html){return Object.fromEntries(Object.entries(assetPaths).map(([key,p])=>{const refs=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(s=>new URL(s,origin).pathname===p);assert.equal(refs.length,1,'SCRIPT_REF '+key);return [key,refs[0]]}))}
export async function build(pub,main,parse){
 const test='https://ball46-statistics-winrate-test-20261119.mccarey-supon.workers.dev';
 const body=await pub('/index.html?view=statistics'),home=await pub('/'),refs=getRefs(body),original={};
 for(const [k,p]of Object.entries(refs)){original[k]=await pub(p);assert.equal(sha(original[k]),expected[k],'ACTIVE_SOURCE_DRIFT '+k)}
 const approved=JSON.parse(await pub('/health',test));assert.equal(approved.mode,'ISOLATED_STATS_WINRATE_V3');assert.equal(approved.marketCount,8);
 const intermediate=patchAll({finance:patchFinance(original.finance),visual:patchVisual(original.visual),fast:original.fast,columns:original.columns,html:body});
 const rebuilt={...patchRate(intermediate),columns:intermediate.columns};
 const assets={};for(const [k,s]of Object.entries(rebuilt)){assert.equal(sha(s),approved.sourceHashes[k],'TESTED_ASSET_HASH '+k);assert.equal(await pub('/'+k+'.js',test),s,'TESTED_BYTES '+k);parse(s,{ecmaVersion:'latest'});assets[assetPaths[k]]=s}
 const total=fs.readFileSync('qa/total-single-renderer-20261119/total-light.css','utf8'),all=fs.readFileSync('qa/total-single-renderer-20261119/all-market-light.css','utf8');
 const parts=[['/total-light.css',total,approved.lightSha],['/wdl.css',wdlCSS,approved.wdlSha],['/all-market-light.css',all,approved.allLightSha],['/win-rate-tone.css',rateCSS,approved.rateSha]];
 for(const [p,s,h]of parts){assert.equal(sha(s),h,'CSS_HASH '+p);assert.equal(await pub(p,test),s,'TEST_CSS_BYTES '+p)}
 assets[cssPath]=parts.map(p=>p[1]).join('\n');
 const patchSource=fs.readFileSync('qa/total-single-renderer-20261119/presentation-all-markets.mjs','utf8'),bt=String.fromCharCode(96);
 const helper=patchSource.split('const domHelper=String.raw'+bt)[1].split(bt+';')[0],htmlOps=[];
 const record=(s,a,b)=>{assert.equal(s.split(a).length,2,'HTML_ANCHOR '+a);htmlOps.push([a,b]);return s.replace(a,b)};
 const inline=patchAll.toString().split('// Stats-only original KPI label and v23 native strip, not live view, not backend.')[1].split('return {finance,visual,fast,columns,html}')[0];
 const collect=new Function('html','once','domHelper',inline+'return html;');
 assert.equal(collect(body,record,helper),intermediate.html);
 const n="if(['WIN','WIN RATE'].includes(label))tone='green';";assert.equal(body.split(n).length,2,'NATIVE_RATE_ANCHOR');htmlOps.push([n,patchNativeHtml(n)]);
 function patchPage(html){
  if(html.includes('<!-- '+tag+' -->'))return html;
  for(const [a,b]of htmlOps){if(html.split(a).length!==2)throw Error('HTML_ANCHOR_DRIFT '+a.slice(0,80));html=html.replace(a,b)}
  for(const [key,p]of Object.entries(assetPaths)){
   const rr=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).filter(s=>new URL(s,'https://ball46.com').pathname===p);
   if(rr.length!==1)throw Error('SCRIPT_REF_DRIFT '+key);
   const old=rr[0],next=old+(old.includes('?')?'&':'?')+'b46_ui='+tag;html=html.replace(old,next);
  }
  if(html.split('</head>').length!==2)throw Error('HEAD_DRIFT');
  return html.replace('</head>','<!-- '+tag+' --><link rel="stylesheet" href="'+cssPath+'"></head>');
 }
 const candidateHtml=patchPage(body);assert(patchPage(home).includes(cssPath));
 for(const m of candidateHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(m[1])||!m[2].trim())continue;if(m[2].includes('b46WdlText')||m[2].includes("else if(label==='WIN RATE')"))parse(m[2],{ecmaVersion:'latest'})}
 const payloadSource='export const assets='+JSON.stringify(assets)+';\nexport const htmlOps='+JSON.stringify(htmlOps)+';\nexport const tag='+JSON.stringify(tag)+';\nexport const cssPath='+JSON.stringify(cssPath)+';\nexport const assetPaths='+JSON.stringify(assetPaths)+';\nexport '+patchPage.toString()+'\n';
 const entrySource='import original from '+JSON.stringify('./'+main)+';\nexport * from '+JSON.stringify('./'+main)+';\nimport {assets,patchPage,tag,cssPath} from "./'+payload+'";\nexport default {...original,async fetch(request,env,ctx){const u=new URL(request.url),path=u.pathname;if(["GET","HEAD"].includes(request.method)&&Object.hasOwn(assets,path)){return new Response(request.method==="HEAD"?null:assets[path],{status:200,headers:{"content-type":path===cssPath?"text/css; charset=utf-8":"application/javascript; charset=utf-8","cache-control":"no-store, max-age=0","x-content-type-options":"nosniff","x-b46-statistics-ui":tag}})}const res=await original.fetch(request,env,ctx);if(request.method!=="GET"||!["/","/index.html"].includes(path)||res.status!==200||!res.headers.get("content-type")?.includes("text/html"))return res;const body=await res.text();const h=new Headers(res.headers);for(const k of ["content-length","content-encoding","etag","last-modified"])h.delete(k);h.set("cache-control","no-store, max-age=0");try{const out=patchPage(body);h.set("x-b46-statistics-ui",tag);return new Response(out,{status:res.status,headers:h})}catch(e){h.set("x-b46-statistics-ui","anchor-drift");return new Response(body,{status:res.status,headers:h})}}};\n';
 for(const s of [payloadSource,entrySource])parse(s,{ecmaVersion:'latest',sourceType:'module'});
 return {assets,candidateHtml,add:{[entry]:entrySource,[payload]:payloadSource}};
}
