const ORIGIN='https://www.ball46.com/';
const noStore={cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)};
const index=await (await fetch(ORIGIN+'index.html?_='+Date.now(),noStore)).text();
const scripts=[
  ...[...index.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>({kind:'external',src:m[1]})),
  ...[...index.matchAll(/<script(?![^>]+src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m,i)=>({kind:'inline',src:'index.html#script-'+(i+1),text:m[1]}))
];
const needles=['workspace-scorebar','workspaceScorebar','scorebar','data-scorebar-signal-result','workspace-scorebar-signal-result','workspace-scorebar-pending'];
const mutators=['innerHTML','outerHTML','replaceChildren','appendChild','append(','prepend(','className','classList','setAttribute','style.','cssText','insertAdjacentHTML'];
const out={checkedAt:new Date().toISOString(),indexBytes:Buffer.byteLength(index),matches:[]};
function snippets(text){
  const lower=text.toLowerCase(), found=[];
  for(const needle of needles){
    let start=0,count=0;
    while(count<20){
      const i=lower.indexOf(needle.toLowerCase(),start);if(i<0)break;
      const a=Math.max(0,i-1800),b=Math.min(text.length,i+3200);
      const sn=text.slice(a,b).replace(/\s+/g,' ');
      found.push({needle,index:i,mutators:mutators.filter(m=>sn.includes(m)),snippet:sn});
      start=i+needle.length;count++;
    }
  }
  return found;
}
for(const s of scripts){
  let text=s.text||'',status=200;
  if(s.kind==='external'){
    try{const resp=await fetch(new URL(s.src,ORIGIN),noStore);status=resp.status;text=await resp.text()}catch(e){out.matches.push({src:s.src,error:e.message});continue}
  }
  const hits=snippets(text);
  if(hits.length)out.matches.push({kind:s.kind,src:s.src,status,bytes:Buffer.byteLength(text),hits});
}
console.log(JSON.stringify(out,null,2));