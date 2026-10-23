import {writeFile,mkdir} from 'node:fs/promises';
const u='https://ball46.com/';const html=await(await fetch(u+'?signalRace='+Date.now(),{headers:{'cache-control':'no-cache'}})).text();
const tags=[...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
const style=tags.find(x=>x[1].includes('b46-featured-approved-sections-v10'))?.[2]||'';
const src=await(await fetch(u+'dashboard-v2-stage3-featured-facts-20261013a.js?v=live-header-search-20261018')).text();
const contexts=(data,tokens,n=6,range=600)=>Object.fromEntries(tokens.map(t=>{let i=-1,a=[];while((i=data.indexOf(t,i+1))>=0&&a.length<n)a.push({index:i,around:data.slice(Math.max(0,i-range),Math.min(data.length,i+t.length+range))});return[t,a]}));
const record={at:new Date().toISOString(),renderer:contexts(src,['function patchFeatureSignalHost','function signalDetailsHtml','function newFeatureSignalParts','function renderFeatured','function setState'],2,1800),css:contexts(style,['data-v11-kind="metrics"','data-v11-kind','data-v11-count','feature-signal-main','data-b46-stable-signal-state'],4,470)};
await mkdir('audit',{recursive:true});await writeFile('audit/signals-focused.json',JSON.stringify(record,null,2));
console.log('B46_SIGNAL_RACE_EVIDENCE='+JSON.stringify({renderer:record.renderer,css:record.css}).slice(0,12500));
