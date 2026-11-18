// Staging-only read paths. A graph read never traverses history.
// The metadata snapshot is a separate, explicitly verified legacy dependency.
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
const keys=['all',...MARKET_GROUPS];
const integer=(x,d)=>x==null?d:/^\d+$/.test(x)?Number(x):NaN;
const reply=(status,body)=>({status,body});
export function createStageReadApi(projection){
 return (path,search='',method='GET')=>{
  if(method!=='GET')return reply(405,{ok:false});
  const q=new URLSearchParams(search),market=q.get('market')??'all';
  if(!keys.includes(market))return reply(400,{ok:false,error:'MARKET_INVALID'});
  const state=projection.status();
  if(!state.ready)return reply(503,{ok:false,error:'PROJECTION_NOT_READY'});
  const offset=integer(q.get('offset'),0),limit=integer(q.get('limit'),50),gen=integer(q.get('generation'),state.generation);
  try{
   if(path==='/_stage/read/head'){
    const g=projection.readGraph(market),p=projection.pendingPage({market,limit:1});
    return reply(200,{ok:true,source:'STAGE_BOOK',market,generation:state.generation,asOf:state.asOf,total:g.summary.rows,pending:p.pending,unresolved:p.unresolved,raw_counts:g.counts,pnl:g.summary.net,book_win_rate:g.win_rate,display_win_rate:g.series.rate.at(-1)?.value??null});
   }
   if(path==='/_stage/read/graph')return reply(200,{...projection.readGraph(market),market});
   if(path==='/_stage/read/pending'||path==='/_stage/read/history'){
    if(gen!==state.generation)return reply(409,{ok:false,error:'GENERATION_CHANGED'});
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return reply(400,{ok:false,error:'INVALID_PAGE'});
    return reply(200,{ok:true,source:path.endsWith('pending')?'VERIFIED_LEGACY_METADATA':'BOOK_WITH_VERIFIED_LEGACY_METADATA',... (path.endsWith('pending')?projection.pendingPage({market,offset,limit}):projection.historyPage({market,offset,limit,expectedGeneration:gen}))});
   }
   if(path==='/_stage/read/detail'){
    if(gen!==state.generation)return reply(409,{ok:false,error:'GENERATION_CHANGED'});
    const r=projection.detail(q.get('id'));return r&&(market==='all'||marketGroup(r.market)===market)?reply(200,{ok:true,generation:state.generation,row:r}):reply(404,{ok:false});
   }
  }catch(e){return reply(400,{ok:false,error:String(e.message).slice(0,80)})}
  return reply(404,{ok:false});
 };
}
