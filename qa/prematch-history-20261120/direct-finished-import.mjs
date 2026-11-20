import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest,normalize,totals,dailyPlan,pathFor} from './history.mjs';
assert(process.env.FIVEDOLLAR_API_KEY,'NO_APPROVED_KEY');
assert(process.env.GITHUB_RUN_ATTEMPT==='1','NO_AUTOMATIC_REPLAY');
fs.mkdirSync('evidence/history',{recursive:true});
const sql=new DatabaseSync('evidence/history/results.sqlite');
const db={exec:(q,...a)=>{const s=sql.prepare(q);return /^\s*SELECT/i.test(q)?s.all(...a):(s.run(...a),[])},transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
init(db);
const now=Math.floor(Date.now()/1000),window=dailyPlan(now).windows.find(w=>w.kind==='daily');
const report={window,requests:0,pages:[],state:'IN_PROGRESS',source:'5USD_DIRECT_FINISHED',stored:totals(db)};
function save(){report.stored=totals(db);fs.writeFileSync('evidence/history/report.json',JSON.stringify(report,null,2));console.log('DIRECT_HISTORY '+JSON.stringify(report))}
try{
 for(let p=1;p<=5;p++){
  report.requests++;
  const r=await fetch('https://api.5dollarfootballapi.com'+pathFor(window,p),{headers:{authorization:'Bearer '+process.env.FIVEDOLLAR_API_KEY,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const rawRemaining=r.headers.get('x-ratelimit-remaining'),remaining=rawRemaining===null?null:Number(rawRemaining);
  if(!r.ok){report.state='HTTP_'+r.status;break}
  const j=await r.json();
  assert(j.success===1&&Array.isArray(j.data)&&j.data.length<=100&&j.pagination?.page===p&&typeof j.pagination.has_more==='boolean','INVALID_RESPONSE');
  const valid=j.data.filter(f=>{const n=normalize(f);return n?.status==='finished'&&n.k>=window.start&&n.k<window.end});
  fs.writeFileSync('evidence/history/page-'+p+'.json',JSON.stringify(j.data));
  const stats=ingest(db,valid,now,{start:window.start,end:window.end});
  report.pages.push({page:p,received:j.data.length,accepted:valid.length,remaining,more:j.pagination.has_more,stats});
  report.state=j.pagination.has_more?'PARTIAL':'DAILY_WINDOW_COMPLETE';save();
  if(!j.pagination.has_more)break;
  if(!Number.isInteger(remaining)||remaining<=25){report.state='PAUSED_HEADROOM';break}
  await new Promise(r=>setTimeout(r,2000));
 }
}catch(e){report.state='REVIEW_REQUIRED';report.error=String(e.message).slice(0,200)}
finally{save();sql.close()}
