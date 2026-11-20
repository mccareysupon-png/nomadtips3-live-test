// Pre-match only. John: one bulk finished window per day, paginate only when required.
// No network access on import; one explicit page invocation per externally approved job.
// Permanent archive remains the single target. No live or per-team requests.
import {dailyPlan,pathFor,normalize} from './history.mjs';
export function finishedRequest(now, page=1, kind='daily', windowIndex=0){
 const windows=dailyPlan(now).windows.filter(w=>w.kind===kind);
 const w=windows[windowIndex];if(!w)throw Error('INVALID_WINDOW');
 return {window:w,page,path:pathFor(w,page)};
}
export function seasonRequest(league,season,page=1){
 if(!Number.isSafeInteger(league)||league<=0||typeof season!=='string'||!/^\d{2,4}(\/\d{2,4})?$/.test(season)||!Number.isSafeInteger(page)||page<1)throw Error('CONFIRMED_LEAGUE_SEASON_REQUIRED');
 return {league,season,page,path:'/v1/leagues/'+league+'/fixtures?'+new URLSearchParams({season,status:'finished',per_page:'100',page:String(page)})};
}
export function validatePage(body,plan,now){
 if(body?.success!==1||!Array.isArray(body.data)||body.data.length>100||body.pagination?.page!==plan.page||typeof body.pagination.has_more!=='boolean'||(body.pagination.has_more&&!body.data.length))throw Error('INVALID_PROVIDER_PAGE');
 const rows=body.data.filter(f=>{const n=normalize(f);return n?.status==='finished'&&n.k<now&&(!plan.league||n.league===plan.league)&&(!plan.window||(n.k>=plan.window.start&&n.k<plan.window.end))});
 return {rows,rejected:body.data.length-rows.length,nextPage:body.pagination.has_more?plan.page+1:null};
}
export async function importOnePage(plan,{fetchApprovedPage,storePage,now}){
 if(typeof fetchApprovedPage!=='function'||typeof storePage!=='function'||!Number.isSafeInteger(now))throw Error('EXPLICIT_TRANSPORT_REQUIRED');
 const r=await fetchApprovedPage(plan.path);
 if(r.status!==200)throw Error('PROVIDER_HTTP_'+r.status);
 const parsed=validatePage(r.body,plan,now);
 if(parsed.rows.length)await storePage(parsed.rows);
 return {received:parsed.rows.length+parsed.rejected,accepted:parsed.rows.length,rejected:parsed.rejected,nextPage:parsed.nextPage,requests:1};
}
