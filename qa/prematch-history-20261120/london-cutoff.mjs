// BALL46 Pre-Match calendar: same 06:00 Europe/London accounting boundary as LIVE.
// Pure time calculations; does not request or schedule provider data.
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(sec){const p=Object.fromEntries(fmt.formatToParts(new Date(sec*1000)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));return p}
const day=s=>new Date(s*1000).toISOString().slice(0,10);
function cutoffUtc(dayIso){const [y,m,d]=dayIso.split('-').map(Number);const check=Math.floor(Date.UTC(y,m-1,d,6,0,0)/1000);const seen=parts(check);if(seen.year!==y||seen.month!==m||seen.day!==d||!Number.isInteger(seen.hour))throw Error('LONDON_TIME_UNAVAILABLE');return check-(seen.hour-6)*3600}
export function londonAccountingWindow(epoch){if(!Number.isSafeInteger(epoch)||epoch<=0)throw Error('INVALID_TIMESTAMP');const p=parts(epoch),calendar=Date.UTC(p.year,p.month-1,p.day)/1000;const businessDay=p.hour<6?day(calendar-86400):day(calendar),begin=cutoffUtc(businessDay),next=day(Date.parse(businessDay+'T00:00:00Z')/1000+86400),end=cutoffUtc(next);if(epoch<begin||epoch>=end)throw Error('CUTOFF_WINDOW_INCONSISTENT');return {timezone:'Europe/London',cutoffLocal:'06:00',businessDay,begin,end,nextBusinessDay:next,thailandCutoffHour:new Date(begin*1000).getUTCHours()+7>=24?new Date(begin*1000).getUTCHours()-17:new Date(begin*1000).getUTCHours()+7,providerCalls:0}}
function query(db,sql,...values){return Array.from(db.exec(sql,...values))[0]||{}}
export function preMatchDailyBook(db,now){const window=londonAccountingWindow(now),{begin,end}=window;
 const selected=query(db,'SELECT COUNT(*) AS total,COALESCE(SUM(status=\'PENDING\'),0) AS pending FROM test_pick_1x2 WHERE picked_at>=? AND picked_at<?',begin,end);
 const settled=query(db,'SELECT COUNT(*) AS total,COALESCE(SUM(status=\'WIN\'),0) AS win,COALESCE(SUM(status=\'LOSS\'),0) AS loss,COALESCE(SUM(units),0) AS units FROM test_pick_1x2 WHERE settled_at>=? AND settled_at<?',begin,end);
 const active=query(db,"SELECT COUNT(*) AS total FROM test_pick_1x2 WHERE status='PENDING'");
 const win=Number(settled.win||0),loss=Number(settled.loss||0);
 return {window,selected:{total:Number(selected.total||0),pending:Number(selected.pending||0)},settled:{total:Number(settled.total||0),win,loss,winRate:win+loss?100*win/(win+loss):null,units:Number(settled.units||0)},carriedPending:Number(active.total||0),basis:'SETTLED_AT_FOR_WINRATE_AND_PL',model:'LONDON_06_SHARED_WITH_LIVE',providerCalls:0}
}
