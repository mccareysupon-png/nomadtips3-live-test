const bases=[
 ['prod','https://ball46.com'],
 ['last-failed-new','https://f71b04c1-ball46-production.mccarey-supon.workers.dev'],
 ['old-passed-candidate','https://7dc75355-ball46-production.mccarey-supon.workers.dev'],
 ['older-passed-candidate','https://83e1752e-ball46-production.mccarey-supon.workers.dev'],
 ['other-failed-new','https://17be50b1-ball46-production.mccarey-supon.workers.dev'],
 ['www','https://www.ball46.com']
];
for(const [label,base] of bases){
 for(const path of ['/','/dashboard-v2-stage3-featured-facts-20261013a.js']){
  try{
   const u=new URL(path,base);u.searchParams.set('diag_v13',String(Date.now()));
   const r=await fetch(u,{redirect:'follow',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(17000)});
   const body=await r.text();
   const title=body.match(/<title[^>]*>([^<]+)</i)?.[1];
   const snippets=[...body.matchAll(/.{0,130}(?:error\s*(?:code)?\s*1\d{3}|worker threw|internal server|script startup|unable to|runtime|failure|Something went wrong|Cloudflare Ray ID).{0,230}/gi)].slice(0,8).map(x=>x[0]);
   console.log('B46_V13_CANDIDATE_HTTP_DIAG',JSON.stringify({
     label,path,status:r.status,title,ctype:r.headers.get('content-type'),size:body.length,
     cache:r.headers.get('cf-cache-status'),ray:r.headers.get('cf-ray'),
     age:r.headers.get('age'),server:r.headers.get('server'),
     first:body.slice(0,650),last:body.slice(-950),errorSnippets:snippets,
     marker:body.includes('B46_V13_FEATURED_STABLE_RENDER'),style:body.includes('b46-globe-hidden-v13-20261022')
   }));
  }catch(e){console.log('B46_V13_CANDIDATE_HTTP_DIAG',JSON.stringify({label,path,error:String(e)}))}
 }
}