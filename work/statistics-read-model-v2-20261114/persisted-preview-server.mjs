// Local non-public test server over independently persisted pages.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const D='work/statistics-read-model-v2-20261114';
export async function startPersistedPreview(store){
 const html=await readFile(D+'/preview.html','utf8'),requests=[];
 const server=createServer(async(req,res)=>{
  const reply=(status,payload,kind='application/json')=>{res.writeHead(status,{'content-type':kind,'cache-control':'no-store'});res.end(kind.startsWith('text/')?payload:JSON.stringify(payload))};
  try{
   if(req.method!=='GET')return reply(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
   const url=new URL(req.url,'http://127.0.0.1');requests.push({path:url.pathname,at:Date.now()});
   if(url.pathname==='/')return reply(200,html,'text/html; charset=utf-8');
   if(url.pathname==='/api/statistics/fast-summary'){
    const result=await store.summary();return reply(result.ok?200:503,result);
   }
   if(url.pathname==='/api/statistics/fast-view'){
    const range=url.searchParams.get('rangeDays')||'all';
    const out=await store.view({
     market:url.searchParams.get('market')||'all',
     variant:url.searchParams.get('variant')||'all',
     filter:url.searchParams.get('filter')||'all',
     page:Number(url.searchParams.get('page')||1),limit:Number(url.searchParams.get('limit')||50),
     revision:url.searchParams.get('revision'),
     rangeDays:range==='all'?'all':Number(range)
    });
    return reply(out.status||200,out);
   }
   return reply(404,{ok:false,error:'NOT_FOUND'});
  }catch(e){return reply(503,{ok:false,error:String(e?.message||e).slice(0,160)})}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return{origin:'http://127.0.0.1:'+server.address().port,requests,close:()=>new Promise(r=>server.close(r))};
}
