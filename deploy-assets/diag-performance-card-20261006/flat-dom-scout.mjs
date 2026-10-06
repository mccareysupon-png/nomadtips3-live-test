const ORIGIN='https://www.ball46.com/';
const noStore={cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)};
const index=await (await fetch(ORIGIN+'index.html?_='+Date.now(),noStore)).text();
const resources=[
  ...[...index.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map(m=>({kind:'css',src:m[1]})),
  ...[...index.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>({kind:'js',src:m[1]}))
];
const inline=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m,i)=>({kind:'inline-css',src:'index.html#style-'+(i+1),text:m[1]}));
const needles=['workspace-scorebar','data-workspace-scorebar-slot','b46-mobile-v3','display:none','visibility:hidden','opacity:0','z-index','outcome-win','outcome-loss','workspace-scorebar-pending','workspace-scorebar-signal-result','scorebar-grid'];
const out={checkedAt:new Date().toISOString(),indexBytes:Buffer.byteLength(index),resources:[],inline:[]};
function collect(text){
  const lower=text.toLowerCase(),hits=[];
  for(const needle of needles){
    let start=0,count=0;
    while(count<12){
      const i=lower.indexOf(needle.toLowerCase(),start);if(i<0)break;
      hits.push({needle,index:i,snippet:text.slice(Math.max(0,i-700),Math.min(text.length,i+1400)).replace(/\s+/g,' ')});
      start=i+needle.length;count++;
    }
  }
  return hits;
}
for(const item of inline){
  const hits=collect(item.text);
  if(hits.some(h=>/scorebar|mobile-v3/i.test(h.needle)))out.inline.push({src:item.src,bytes:Buffer.byteLength(item.text),hits});
}
for(const r of resources){
  const u=new URL(r.src,ORIGIN).href;
  let text='';let status=null;
  try{const resp=await fetch(u,noStore);status=resp.status;text=await resp.text()}catch(e){out.resources.push({kind:r.kind,src:r.src,error:e.message});continue}
  const hits=collect(text);
  if(hits.some(h=>/scorebar|mobile-v3|outcome-/i.test(h.needle))){
    out.resources.push({kind:r.kind,src:r.src,status,bytes:Buffer.byteLength(text),hits});
  }
}
console.log(JSON.stringify(out,null,2));