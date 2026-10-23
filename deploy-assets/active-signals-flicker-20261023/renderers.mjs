import {mkdir,writeFile} from 'node:fs/promises';
const html=await (await fetch('https://ball46.com/?sigSource='+Date.now(),{headers:{'cache-control':'no-cache'}})).text();
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(x=>({attrs:x[1],body:x[2],index:x.index}));
const v11=scripts.find(x=>x.attrs.includes('b46-featured-faithful-v11-20261021'));
const externals=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(x=>x[1]);
const scans=[];
for(const p of externals){if(!p.startsWith('http')&&!p.endsWith('.json')){try{const u=new URL(p,'https://ball46.com/');const r=await fetch(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)continue;const s=await r.text();if(/feature-signal|data-featured-signal|renderFeatured/.test(s)){const patterns=['feature-signal','data-featured-signal','renderFeatured','feature-signal-main'];const matches=[];for(const pat of patterns){let i=-1;while((i=s.indexOf(pat,i+1))>=0&&matches.filter(x=>x.term===pat).length<5)matches.push({term:pat,index:i,context:s.slice(Math.max(0,i-500),Math.min(s.length,i+1000))});}scans.push({path:p,bytes:s.length,matches});}}catch(e){scans.push({path:p,error:String(e)})}}}
const styles=[...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].filter(x=>x[1].includes('b46-featured-approved-sections-v10'));
let o={at:new Date().toISOString(),v11Script:v11?.body,externals:scans,styleBlocks:styles.map(x=>({attrs:x[1],matchOffsets:[...x[2].matchAll(/feature-signal::before|data-v11-count|feature-signal-main|data-b46-stable-signal-state/g)].slice(0,25).map(m=>({kind:m[0],at:m.index,context:x[2].slice(Math.max(0,m.index-200),m.index+360)}))}))};
await mkdir('audit',{recursive:true});await writeFile('audit/signal-renderers.json',JSON.stringify(o,null,2));
console.log('BALL46_RENDERER_STATIC='+JSON.stringify({v11Script:o.v11Script,externals:o.externals.map(x=>({path:x.path,bytes:x.bytes,matches:x.matches?.slice(0,5)})),styleBlocks:o.styleBlocks.map(x=>({attrs:x.attrs,matchOffsets:x.matchOffsets.slice(0,5)}))}).slice(0,14500));
