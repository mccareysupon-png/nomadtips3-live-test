export const validId=x=>typeof x==='string'&&/^\d{1,18}$/.test(x);
export function normalizeHistory(payload,teamId,cutoff,fixtureId){
 if(payload?.success!==1||!Array.isArray(payload.data))throw Error('INVALID_PROVIDER_RESPONSE');
 if(!validId(String(teamId))||!Number.isFinite(cutoff)||cutoff<=0)throw Error('INVALID_HISTORY_REQUEST');
 const seen=new Set(),rows=[];
 for(const f of payload.data){
  const id=String(f.id??''),h=f.teams?.home,a=f.teams?.away,hi=String(h?.id??''),ai=String(a?.id??''),date=Date.parse(f.kickoff_utc||''),ts=Number(f.kickoff_ts)*1000;
  const score=x=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=99;
  if(!validId(id)||id===String(fixtureId)||seen.has(id)||f.status!=='finished'||f.status_code!=='full'||!validId(hi)||!validId(ai)||hi===ai||![hi,ai].includes(String(teamId))||!h.name||!a.name||!Number.isFinite(date)||date<=0||date>=cutoff||date>Date.now()||!Number.isFinite(ts)||Math.abs(ts-date)>1000||!score(f.goals?.home)||!score(f.goals?.away))continue;
  seen.add(id);const home=hi===String(teamId),gf=home?f.goals.home:f.goals.away,ga=home?f.goals.away:f.goals.home;
  rows.push({fixtureId:id,kickoffUtc:new Date(date).toISOString(),home:{id:hi,name:String(h.name).slice(0,160)},away:{id:ai,name:String(a.name).slice(0,160)},goals:{home:f.goals.home,away:f.goals.away},opponent:{id:home?ai:hi,name:String(home?a.name:h.name).slice(0,160)},venue:home?'H':'A',gf,ga,result:gf>ga?'W':gf<ga?'L':'D',status:'FT'});
 }
 rows.sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc));return rows.slice(0,5);
}
export function retrySeconds(header,now=Date.now()){const n=Number(header);return Number.isFinite(n)&&n>0?Math.min(86400,Math.max(60,Math.ceil(n))):Math.min(86400,Math.max(60,Math.ceil((Date.parse(header)-now)/1000)||60));}
