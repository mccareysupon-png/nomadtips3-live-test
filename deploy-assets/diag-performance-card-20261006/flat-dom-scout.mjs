const ORIGIN='https://www.ball46.com/';
const r=await fetch(ORIGIN+'index.html?_='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
const html=await r.text();
const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
const terms=['PENDING','PUSH','HALF_WIN','HALF_LOSS','result','settled','status','ENTRY','FULL TIME','FT'];
const out={indexStatus:r.status,scripts:[],matches:[]};
for(const src of srcs){
  const u=new URL(src,ORIGIN).href;
  let text='';
  try{
    const x=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
    text=await x.text();
    out.scripts.push({src,status:x.status,bytes:Buffer.byteLength(text)});
  }catch(e){out.scripts.push({src,error:e.message});continue}
  const upper=text.toUpperCase();
  let score=0;
  for(const t of terms) if(upper.includes(t.toUpperCase())) score++;
  if(score<3)continue;
  const hits=[];
  for(const term of ['PENDING','PUSH','HALF_WIN','HALF_LOSS','ENTRY','FULL TIME']){
    let start=0,n=0;
    while(n<6){
      const i=upper.indexOf(term,start);
      if(i<0)break;
      const a=Math.max(0,i-700),b=Math.min(text.length,i+1400);
      const snippet=text.slice(a,b).replace(/\s+/g,' ');
      hits.push({term,index:i,snippet});
      start=i+term.length;n++;
    }
  }
  if(hits.length)out.matches.push({src,hits});
}
console.log(JSON.stringify(out,null,2));