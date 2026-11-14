import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const D='work/statistics-read-model-v2-20261114';
export async function startPreview(model){
 const document=await readFile(D+'/preview.html'),requests=[];
 const server=createServer((req,res)=>{
  try{
   if(req.method!=='GET'){res.writeHead(405);return res.end();}
   const u=new URL(req.url,'http://127.0.0.1'),reply=(code,value,type='application/json')=>{res.writeHead(code,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(value):value)};
   requests.push(u.pathname);
   if(u.pathname==='/')return reply(200,document,'text/html; charset=utf-8');
   if(u.pathname==='/api/statistics/fast-summary')return reply(200,model.summary);
   if(u.pathname==='/api/statistics/fast-view'){
    if(u.searchParams.get('revision')!==String(model.summary.contentRevision))return reply(409,{ok:false,error:'REVISION_CHANGED'});
    const range=u.searchParams.get('rangeDays')||'all';
    return reply(200,model.query({market:u.searchParams.get('market')||'all',page:Number(u.searchParams.get('page')||1),limit:Number(u.searchParams.get('limit')||50),rangeDays:range==='all'?'all':Number(range)}));
   }
   return reply(404,{ok:false,error:'NOT_FOUND'});
  }catch(e){res.writeHead(400,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:false,error:String(e.message||e)}))}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return{origin:'http://127.0.0.1:'+server.address().port,requests,close:()=>new Promise(r=>server.close(r))};
}
