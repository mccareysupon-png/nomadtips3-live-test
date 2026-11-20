// Existing production contract, new data source (service binding only).
import {chooseCached,validateLast5} from './last5-archive.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export class HistoryGate{
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){const u=new URL(req.url);if(req.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  if(u.pathname==='/health')return json({ok:!!this.env.ARCHIVE&&!!this.env.LAST5_READ_SECRET,component:'BALL46_FORM_HISTORY_V1',source:'5USD',mode:'ARCHIVE_READ_ONLY',externalRequestsAdded:0});
  if(u.pathname!=='/last5')return json({ok:false,error:'NOT_FOUND'},404);
  let p;try{p=validateLast5(u,Math.floor(Date.now()/1000))}catch{return json({ok:false,error:'INVALID_HISTORY_REQUEST'},400)}
  try{const r=await this.env.ARCHIVE.fetch(new Request('https://history.internal/last5'+u.search,{headers:{authorization:'Bearer '+this.env.LAST5_READ_SECRET}}));if(!r.ok)throw Error('ARCHIVE_UNAVAILABLE');const j=await r.json();if(j.ok!==true||j.source!=='5USD'||String(j.fixtureId)!==p.fixtureId||j.externalRequestsAdded!==0||!j.home?.verified||!j.away?.verified)throw Error('ARCHIVE_CONTRACT');
   const [h,a]=await Promise.all([this.ctx.storage.get('team:'+p.home+':'+p.cutoff),this.ctx.storage.get('team:'+p.away+':'+p.cutoff)]);
   return json({...j,home:chooseCached(j.home,h,p.home,p.cutoff),away:chooseCached(j.away,a,p.away,p.cutoff)});
  }catch{return json({ok:false,fixtureId:p.fixtureId,error:'HISTORY_TEMPORARILY_UNAVAILABLE'},503)}
 }
}
export default{async fetch(req,env){if(new URL(req.url).hostname!=='history.internal')return json({ok:false,error:'NOT_FOUND'},404);return env.HISTORY_GATE.get(env.HISTORY_GATE.idFromName('global-last5-v1')).fetch(req)}};
