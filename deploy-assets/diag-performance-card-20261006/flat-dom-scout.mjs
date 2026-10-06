const ORIGIN='https://www.ball46.com/';
const index=await (await fetch(ORIGIN+'index.html?_='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)})).text();
const srcs=[...index.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
const needles=['next-signal-card','active-signal-card','signal-entry-grid','signal-live-section','PENDING','HALF_WIN','HALF_LOSS','settlement','outcome','result-badge','status-badge'];
const out=[];
for(const src of srcs){
  const u=new URL(src,ORIGIN).href;
  let text='';try{text=await (await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)})).text()}catch{continue}
  const lower=text.toLowerCase();
  const hits=[];
  for(const needle of needles){
    let start=0,count=0;
    while(count<4){
      const i=lower.indexOf(needle.toLowerCase(),start);if(i<0)break;
      hits.push({needle,index:i,snippet:text.slice(Math.max(0,i-1000),Math.min(text.length,i+2200)).replace(/\s+/g,' ')});
      start=i+needle.length;count++;
    }
  }
  if(hits.length)out.push({src,bytes:Buffer.byteLength(text),hits});
}
console.log(JSON.stringify(out,null,2));