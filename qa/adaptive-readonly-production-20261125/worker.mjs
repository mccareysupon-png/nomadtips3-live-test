import {serveAdaptiveReadOnly,project} from './b46-adaptive-readonly-page-20261125.mjs';
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/__b46_adaptive_stage_debug'){
    try{
      const svc=env.B46_ADAPTIVE_READ;
      const response=await svc.fetch('https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/__b46_pm_adaptive_research');
      const body=await response.text();
      let j;try{j=JSON.parse(body)}catch{}
      let projectionError=null;try{project(j)}catch(e){projectionError=String(e.message).slice(0,200)}
      return Response.json({binding:!!svc,status:response.status,len:body.length,projectionError,formulaIds:j?.formulas?.map(x=>x.formula),
        fields:j&&Object.keys(j),formulas:j?.formulas?.length,
        series30:j?.series30?.rangeDays,series90:j?.series90?.rangeDays});
    }catch(e){return Response.json({error:String(e?.message||e).slice(0,400)},{status:503});}
  }
  if(path==='/research/adaptive-ou'||path==='/research/adaptive-ou/'||path==='/research/adaptive-ou/data')
    return serveAdaptiveReadOnly(request,env,ctx);
  return env.B46_PRODUCTION_READ.fetch(request);
 }
};
