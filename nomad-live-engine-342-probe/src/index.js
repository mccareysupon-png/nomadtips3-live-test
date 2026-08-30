const SOURCE='https://www.totalcorner.com';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const json=(value,status=200)=>new Response(JSON.stringify(value,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const strip=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
async function fetchToday(){
  const response=await fetch(`${SOURCE}/match/today/?_nomad_probe=${Date.now()}`,{cache:'no-store',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'}});
  return {status:response.status,text:await response.text()};
}
function cellShape(row){
  return [...String(row).matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((m,index)=>{
    const attrs=m[1]||'',body=m[2]||'';
    const cls=(attrs.match(/\bclass=["']([^"']*)["']/i)||[])[1]||'';
    const title=(attrs.match(/\btitle=["']([^"']*)["']/i)||[])[1]||'';
    const data=Object.fromEntries([...attrs.matchAll(/\bdata-([\w-]+)=["']([^"']*)["']/gi)].map(x=>[x[1],x[2]]));
    const media=[...body.matchAll(/<(?:img|span|i)\b([^>]*)>/gi)].map(x=>({class:(x[1].match(/\bclass=["']([^"']*)["']/i)||[])[1]||'',title:(x[1].match(/\btitle=["']([^"']*)["']/i)||[])[1]||'',alt:(x[1].match(/\balt=["']([^"']*)["']/i)||[])[1]||'',data:Object.fromEntries([...x[1].matchAll(/\bdata-([\w-]+)=["']([^"']*)["']/gi)].map(y=>[y[1],y[2]]))})).filter(x=>x.class||x.title||x.alt||Object.keys(x.data).length);
    return {index,class:cls,title,data,text:strip(body),media:media.slice(0,20),html:body.slice(0,1200)};
  });
}
function rows(html){
  const found=[...String(html).matchAll(/<tr\b([^>]*)data-match_id=["']?(\d+)["']?([^>]*)>([\s\S]*?)<\/tr>/gi)];
  return found.slice(0,12).map(m=>({id:m[2],attrs:`${m[1]} ${m[3]}`.trim(),cells:cellShape(m[4])}));
}
export default {async fetch(request){
  const u=new URL(request.url);if(!['/','/probe'].includes(u.pathname))return json({ok:false},404);
  try{const hit=await fetchToday();return json({ok:hit.status===200,observedAt:new Date().toISOString(),sourceStatus:hit.status,length:hit.text.length,rows:rows(hit.text)});}catch(error){return json({ok:false,error:String(error?.stack||error)},500);}
}};
