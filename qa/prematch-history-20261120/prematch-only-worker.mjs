import {DurableObject} from 'cloudflare:workers';
import {init,ingest,normalize,totals,coverage,dailyPlan,pathFor} from './history.mjs';
import {mergeStoredPrematch} from './stored-prematch-feed.mjs';
import {dryRunStored,BASELINE_SHADOW,ACCUMULATION_SHADOW,TRIAL_SHADOW} from './stored-signal-adapter.mjs';
const AUTO_PROFILE_VERSION='auto-shadow-trial-3-v1';
const json=x=>Response.json(x,{headers:{'cache-control':'no-store'}});
export class PrematchStore extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};init(this.db)}
 async fetch(req){
 const path=new URL(req.url).pathname,now=Math.floor(Date.now()/1000);
 if(path==='/preview-data'&&req.method==='GET'){
 const rows=Array.from(this.db.exec("SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT 50"));
 const allTeams=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), team_rows AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest) SELECT team,COUNT(*) AS matches FROM team_rows GROUP BY team"));
 const saved=await this.ctx.storage.get('previewSelections');
 return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),teams:allTeams.length,teamsWith10:allTeams.filter(n=>n.matches>=10).length,results:rows,selection:saved??null});
 }
 if(path==='/merge-archive'&&req.method==='POST'){
 const j=await req.json();if(!Array.isArray(j.rows)||j.rows.length>2000)return new Response('Invalid archive',{status:400});
 const stats={added:0,duplicate:0,conflict:0};const ids=new Set();
 for(const r of j.rows){if(![r.fixture_id,r.observed,r.league_id,r.kickoff,r.home_id,r.away_id].every(x=>Number.isSafeInteger(x)&&x>0)||r.home_id===r.away_id||r.status!=='finished'||r.kickoff>=r.observed||r.observed>now||![r.hg,r.ag].every(x=>Number.isSafeInteger(x)&&x>=0)||ids.has(r.fixture_id))return new Response('Invalid source row',{status:400});ids.add(r.fixture_id)}
 this.db.transaction(()=>{for(const r of j.rows){const old=Array.from(this.db.exec('SELECT * FROM result_version WHERE fixture_id=? ORDER BY observed DESC LIMIT 1',r.fixture_id))[0];if(old){if(['league_id','kickoff','home_id','away_id','status','hg','ag'].every(k=>old[k]===r[k]))stats.duplicate++;else stats.conflict++;continue}this.db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',r.fixture_id,r.observed,r.league_id,r.kickoff,r.home_id,r.away_id,r.status,r.hg,r.ag);stats.added++}});
 return json({stats,stored:totals(this.db)})}
 if(path==='/merge-summary'&&req.method==='GET'){const rows=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), tr AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest), tc AS (SELECT team,COUNT(*) AS n FROM tr GROUP BY team) SELECT n,COUNT(*) AS teams FROM tc GROUP BY n ORDER BY n"));return json({stored:totals(this.db),distribution:rows,teams:rows.reduce((s,r)=>s+r.teams,0),teamsWith10:rows.filter(r=>r.n>=10).reduce((s,r)=>s+r.teams,0)})}
 if((path==='/shadow-compare'||path==='/dry-run'&&new URL(req.url).searchParams.get('compare')==='1')&&req.method==='GET'){
 const fixtures=await this.ctx.storage.get('botFixtures')??[];
 const prefix="WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), tr AS (SELECT home_id AS team,league_id FROM latest UNION ALL SELECT away_id AS team,league_id FROM latest), tc AS (SELECT team,COUNT(*) AS n FROM tr GROUP BY team) ";
 const distribution=Array.from(this.db.exec(prefix+"SELECT n,COUNT(*) AS teams FROM tc GROUP BY n ORDER BY n"));
 const leagues=Array.from(this.db.exec(prefix+"SELECT league_id,COUNT(*) AS fixtures FROM latest GROUP BY league_id ORDER BY fixtures DESC,league_id"));
 const most=Array.from(this.db.exec(prefix+"SELECT tc.team,tc.n,tr.league_id,COUNT(*) AS league_matches FROM tc JOIN tr ON tr.team=tc.team WHERE tc.n=(SELECT MAX(n) FROM tc) AND tc.n>1 GROUP BY tc.team,tc.n,tr.league_id ORDER BY tc.team,tr.league_id LIMIT 100"));
 return json({mode:'SHADOW_CONFIG_COMPARISON_V1',stored:totals(this.db),inputCount:fixtures.length,coverage:{distribution,maximum:distribution.at(-1)?.n??0,teamsWith3:distribution.filter(x=>x.n>=3).reduce((s,x)=>s+x.teams,0),teamsWith5:distribution.filter(x=>x.n>=5).reduce((s,x)=>s+x.teams,0),teamsWith10:distribution.filter(x=>x.n>=10).reduce((s,x)=>s+x.teams,0),leagueCount:leagues.length,topLeagues:leagues.slice(0,10),mostHistoricalTeams:most},baseline:dryRunStored(this.db,fixtures,now,10,BASELINE_SHADOW),accumulation:dryRunStored(this.db,fixtures,now,10,ACCUMULATION_SHADOW),trial:dryRunStored(this.db,fixtures,now,10,TRIAL_SHADOW),storage:{fixtures:'Durable Object botFixtures',history:'SQLite result_version',odds:'botFixtures[].storedBet365',output:'read-only; no publication'},providerCalls:0,published:0})}
 if(path==='/dry-run'&&req.method==='GET'){const fixtures=await this.ctx.storage.get('botFixtures')??[];return json({stored:totals(this.db),inputCount:fixtures.length,...dryRunStored(this.db,fixtures,now)})}
 if(path==='/bot-state'&&req.method==='GET')return json({config:{...TRIAL_SHADOW,enabled:false,bttsEnabled:true,oneX2Enabled:true,mode:'READ_ONLY_SHADOW',autoVersion:AUTO_PROFILE_VERSION},lastRun:await this.ctx.storage.get('botRun')??null,inputs:(await this.ctx.storage.get('botFixtures')??[]).length,feed:await this.ctx.storage.get('botFeedState')??null,networkCalls:0});
 if((path==='/bot-input'||path==='/select')&&req.method==='POST'){
 const j=await req.json();if(!Array.isArray(j.fixtures)||j.fixtures.length>1000)return new Response('Invalid fixtures',{status:400});
 const old=await this.ctx.storage.get('botFixtures')??[];let merged;try{merged=mergeStoredPrematch(old,j.fixtures,now)}catch(e){return json({error:String(e.message),stored:old.length})}
 if(j.fixtures.length&&merged.stats.accepted===0)return json({error:'NO_VALID_STORED_FIXTURES',stored:old.length,stats:merged.stats});
 if(j.fixtures.length){await this.ctx.storage.put('botFixtures',merged.fixtures);await this.ctx.storage.put('botFeedState',{at:now,source:path,stats:merged.stats,providerCalls:0})}
 const shadow=dryRunStored(this.db,merged.fixtures,now,1000,TRIAL_SHADOW);return json({system:'BALL46_PREMATCH_ONLY',stored:merged.stats.stored,feed:merged.stats,rows:shadow.rows.map(x=>({...x,picks:[]})),counts:shadow.counts,diagnostics:shadow.diagnostics,published:0,ruleState:'READ_ONLY_SHADOW',networkCalls:0});
 }
 if(path==='/bot-switch'&&req.method==='POST')return new Response('Publication disabled in test shadow',{status:409});
 if(path==='/bot-run'&&req.method==='POST'){
 const fixtures=await this.ctx.storage.get('botFixtures')??[];
 const report=dryRunStored(this.db,fixtures,now,1000,TRIAL_SHADOW);
 const archiveTeams=Array.from(this.db.exec("WITH latest AS (SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id)), team_rows AS (SELECT home_id AS team FROM latest UNION ALL SELECT away_id AS team FROM latest) SELECT team,COUNT(*) AS matches FROM team_rows GROUP BY team ORDER BY matches DESC,team"));
 const archiveCoverage={finished:Number(totals(this.db).finished??0),teams:archiveTeams.length,ready:archiveTeams.filter(x=>x.matches>=3).length,insufficient:archiveTeams.filter(x=>x.matches<3).length,maximum:archiveTeams[0]?.matches??0};
 const rows=report.rows.map(r=>({...r,picks:[]}));
 const out={...report,rows,system:'BALL46_PREMATCH_ONLY',ruleState:'READ_ONLY_SHADOW',autoVersion:AUTO_PROFILE_VERSION,checkedAt:now,networkCalls:0,archiveCoverage,qualified:rows.filter(x=>x.btts.signal!=='NO_SIGNAL'||x.oneX2.signal!=='NO_SIGNAL').length};
 await this.ctx.storage.put('botRun',{checkedAt:now,inputs:fixtures.length,checked:report.counts.upcoming,archiveCoverage,complete:report.counts.historyComplete,qualified:out.qualified,networkCalls:0,mode:out.mode,profile:report.profile,counts:report.counts,outcomes:report.outcomes,diagnostics:report.diagnostics,autoVersion:AUTO_PROFILE_VERSION,published:0});await this.ctx.storage.put('previewSelections',out);return json(out)}
 if(path==='/daily-state'&&req.method==='GET')return json({stored:totals(this.db),daily:await this.ctx.storage.get('dailyImport')??null});
 if(path==='/daily-init'&&req.method==='POST'){
 const old=await this.ctx.storage.get('dailyImport');
 if(!old){const seed={cycle:'1795154400',state:'complete',source:'verified_import_run_44723780062',requests:2,accepted:113};const n=Number(totals(this.db).finished);if(n<113)return new Response('Missing verified import',{status:409});await this.ctx.storage.put('dailyImport',seed)}
 return json({daily:await this.ctx.storage.get('dailyImport'),stored:totals(this.db)})}
 if(path==='/daily-run'&&req.method==='POST'){
 const plan=dailyPlan(now);const old=await this.ctx.storage.get('dailyImport');
 if(old?.cycle===plan.cycle)return json({state:'already_recorded',daily:old,stored:totals(this.db)});
 if(!old||!this.env.FIVEDOLLAR_API_KEY)return new Response('Not initialized',{status:409});
 const state={cycle:plan.cycle,state:'in_progress',requests:0,accepted:0,added:0};
 await this.ctx.storage.put('dailyImport',state);
 try{
 for(const w of plan.windows.filter(w=>w.kind==='daily')){
  let p=1;for(;;){
   state.requests++;await this.ctx.storage.put('dailyImport',state);
   const r=await fetch('https://api.5dollarfootballapi.com'+pathFor(w,p),{headers:{authorization:'Bearer '+this.env.FIVEDOLLAR_API_KEY,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('PROVIDER_HTTP_'+r.status);
   const b=await r.json();if(b.success!==1||!Array.isArray(b.data)||b.data.length>100||b.pagination?.page!==p||typeof b.pagination.has_more!=='boolean'||(b.pagination.has_more&&!b.data.length))throw Error('INVALID_PROVIDER_PAGE');
   const rows=b.data.filter(f=>{const n=normalize(f);return n?.status==='finished'&&n.k>=w.start&&n.k<w.end&&n.k<now});
   const stats=ingest(this.db,rows,now,{start:w.start,end:w.end});state.accepted+=rows.length;state.added+=stats.added;state.rejected=(state.rejected||0)+b.data.length-rows.length;await this.ctx.storage.put('dailyImport',state);
   if(!b.pagination.has_more)break;
   const head=r.headers.get('x-ratelimit-remaining');if(head===null||!Number.isFinite(Number(head))||Number(head)<=20)throw Error('SAFE_QUOTA_STOP');p++;
  }
 }
 state.state='complete';
 }catch(e){state.state='review_required';state.reason=String(e.message).slice(0,120)}
 await this.ctx.storage.put('dailyImport',state);return json({daily:state,stored:totals(this.db)})}
 if(path==='/health')return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),liveBindings:0});
 if(path==='/import'&&req.method==='POST'){const j=await req.json();if(!Array.isArray(j.rows)||j.rows.length>100||j.rows.some(f=>normalize(f)?.status!=='finished'||f.kickoff_ts>=now))return new Response('Invalid rows',{status:400});return json({ok:true,stats:ingest(this.db,j.rows,now),stored:totals(this.db)})}
 return new Response('Not found',{status:404})
 }}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BALL46 | Pre-Match Test</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1117;color:#e6edf3;font:15px system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:24px 16px}header{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #30363d;padding-bottom:20px}h1{font-size:23px;margin:0}h1 span{color:#30d17b}small{color:#9da9b6}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}.card,section{border:1px solid #30363d;border-radius:12px;background:#161b22;padding:16px}.card b{display:block;font-size:28px;margin-top:8px}section{margin:12px 0}h2{font-size:17px;margin-top:0}p{line-height:1.6;color:#aab6c3}.warn{color:#e9b75e}table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}th,td{padding:10px;border-bottom:1px solid #30363d}th{color:#aab6c3}.scroll{overflow:auto}button{background:#238636;color:white;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}footer{color:#aab6c3;margin-top:20px}</style><main><header><h1>ball<span>46</span> / Pre-Match</h1><small>ISOLATED TEST</small></header><div id="status">Loading stored data…</div><div class="cards" id="cards"></div><section><h2>Selection status</h2><div id="selection"></div></section><section><h2>Actual finished results · latest 50</h2><div class="scroll"><table><thead><tr><th>Fixture ID</th><th>Kickoff (UTC)</th><th>Home ID</th><th>FT</th><th>Away ID</th><th>League ID</th></tr></thead><tbody id="results"></tbody></table></div></section><button onclick="load()">Refresh data</button><footer>Read-only preview · No Live Engine binding · No provider request on page load</footer></main><script>
const el=id=>document.getElementById(id);function cell(tr,v){const td=document.createElement('td');td.textContent=v;tr.append(td)}
async function load(){try{const r=await fetch('/preview-data',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();el('status').textContent='Connected to independent Pre-Match archive';el('cards').replaceChildren();for(const [label,value] of [['Finished results',d.stored.finished||0],['Teams in archive',d.teams],['Teams with 10+',d.teamsWith10],['Published picks',d.selection?.published??0]]){const c=document.createElement('div');c.className='card';c.textContent=label;const b=document.createElement('b');b.textContent=value;c.append(b);el('cards').append(c)}el('selection').textContent=d.selection?'Candidates: '+d.selection.rows.length+' · '+d.selection.ruleState:'No upcoming fixtures submitted yet. Initial league backfill and selection rules are pending.';el('selection').className='warn';el('results').replaceChildren();for(const x of d.results){const tr=document.createElement('tr');for(const v of [x.fixture_id,new Date(x.kickoff*1000).toISOString().slice(0,16).replace('T',' '),x.home_id,x.hg+' : '+x.ag,x.away_id,x.league_id])cell(tr,v);el('results').append(tr)}}catch(e){el('status').textContent='Load failed: '+e.message}}load();
</script></html>`;
export default {async scheduled(event,env){const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(new Date(event.scheduledTime));const stub=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));if(event.cron==='*/15 * * * *'){const r=await stub.fetch('https://prematch.internal/bot-run',{method:'POST'});console.log('PREMATCH_BOT '+r.status);return}if(hour!=='06')return;const r=await stub.fetch('https://prematch.internal/daily-run',{method:'POST'});console.log('PREMATCH_DAILY '+await r.text())},async fetch(req,env){const p=new URL(req.url).pathname;if(req.method==='GET'&&p==='/preview')return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});if(req.method==='GET'&&p==='/preview-data')return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req);if(!env.OWNER_SECRET||req.headers.get('Authorization')!=='Bearer '+env.OWNER_SECRET)return new Response('Not found',{status:404});return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req)}};
