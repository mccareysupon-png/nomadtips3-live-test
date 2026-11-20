import {DurableObject} from 'cloudflare:workers';
import {init,ingest,normalize,totals,coverage} from './history.mjs';
const json=x=>Response.json(x,{headers:{'cache-control':'no-store'}});
export class PrematchStore extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};init(this.db)}
 async fetch(req){
 const path=new URL(req.url).pathname,now=Math.floor(Date.now()/1000);
 if(path==='/preview-data'&&req.method==='GET'){
 const rows=Array.from(this.db.exec("SELECT r.* FROM result_version r WHERE r.status='finished' AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id) ORDER BY r.kickoff DESC LIMIT 500"));
 const teams=new Map();for(const row of rows){for(const id of [row.home_id,row.away_id])teams.set(id,(teams.get(id)||0)+1)}
 const saved=await this.ctx.storage.get('previewSelections');
 return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),teams:teams.size,teamsWith10:[...teams.values()].filter(n=>n>=10).length,results:rows.slice(0,50),selection:saved??null});
 }
 if(path==='/health')return json({system:'BALL46_PREMATCH_ONLY',stored:totals(this.db),liveBindings:0});
 if(path==='/import'&&req.method==='POST'){const j=await req.json();if(!Array.isArray(j.rows)||j.rows.length>100||j.rows.some(f=>normalize(f)?.status!=='finished'||f.kickoff_ts>=now))return new Response('Invalid rows',{status:400});return json({ok:true,stats:ingest(this.db,j.rows,now),stored:totals(this.db)})}
 if(path==='/select'&&req.method==='POST'){
 const {fixtures,rules}=await req.json();if(!Array.isArray(fixtures)||fixtures.length>500)return new Response('Invalid fixtures',{status:400});
 const pct=(a,f)=>a.filter(f).length/10;
 const form=a=>({btts:pct(a,x=>x.btts),scored:pct(a,x=>x.gf>0),conceded:pct(a,x=>x.ga>0),win:pct(a,x=>x.result==='W'),draw:pct(a,x=>x.result==='D'),loss:pct(a,x=>x.result==='L'),gd:a.reduce((s,x)=>s+x.gf-x.ga,0)});
 const rows=[];
 for(const f of fixtures){const k=f.kickoff_ts,h=Number(f.teams?.home?.id),a=Number(f.teams?.away?.id);if(f.status!=='scheduled'||!Number.isSafeInteger(k)||k<=now||![h,a].every(x=>Number.isSafeInteger(x)&&x>0)||h===a)continue;
 const hc=coverage(this.db,h,k,now),ac=coverage(this.db,a,k,now);
 const row={fixtureId:f.id,homeCount:hc.count,awayCount:ac.count,picks:[]};
 if(hc.complete&&ac.complete){row.home=form(hc.matches);row.away=form(ac.matches);row.state='AWAITING_APPROVED_RULES_AND_BET365';}else row.state='INSUFFICIENT_HISTORY';
 rows.push(row)}
 const out={system:'BALL46_PREMATCH_ONLY',rows,published:0,ruleState:'NO_APPROVED_NUMERIC_THRESHOLDS_INSTALLED'};await this.ctx.storage.put('previewSelections',out);return json(out);
 }
 return new Response('Not found',{status:404})
 }}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BALL46 | Pre-Match Test</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1117;color:#e6edf3;font:15px system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:24px 16px}header{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #30363d;padding-bottom:20px}h1{font-size:23px;margin:0}h1 span{color:#30d17b}small{color:#9da9b6}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0}.card,section{border:1px solid #30363d;border-radius:12px;background:#161b22;padding:16px}.card b{display:block;font-size:28px;margin-top:8px}section{margin:12px 0}h2{font-size:17px;margin-top:0}p{line-height:1.6;color:#aab6c3}.warn{color:#e9b75e}table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}th,td{padding:10px;border-bottom:1px solid #30363d}th{color:#aab6c3}.scroll{overflow:auto}button{background:#238636;color:white;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}footer{color:#aab6c3;margin-top:20px}</style><main><header><h1>ball<span>46</span> / Pre-Match</h1><small>ISOLATED TEST</small></header><div id="status">Loading stored data…</div><div class="cards" id="cards"></div><section><h2>Selection status</h2><div id="selection"></div></section><section><h2>Actual finished results · latest 50</h2><div class="scroll"><table><thead><tr><th>Fixture ID</th><th>Kickoff (UTC)</th><th>Home ID</th><th>FT</th><th>Away ID</th><th>League ID</th></tr></thead><tbody id="results"></tbody></table></div></section><button onclick="load()">Refresh data</button><footer>Read-only preview · No Live Engine binding · No provider request on page load</footer></main><script>
const el=id=>document.getElementById(id);function cell(tr,v){const td=document.createElement('td');td.textContent=v;tr.append(td)}
async function load(){try{const r=await fetch('/preview-data',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();el('status').textContent='Connected to independent Pre-Match archive';el('cards').replaceChildren();for(const [label,value] of [['Finished results',d.stored.finished||0],['Teams in archive',d.teams],['Teams with 10+',d.teamsWith10],['Published picks',d.selection?.published??0]]){const c=document.createElement('div');c.className='card';c.textContent=label;const b=document.createElement('b');b.textContent=value;c.append(b);el('cards').append(c)}el('selection').textContent=d.selection?'Candidates: '+d.selection.rows.length+' · '+d.selection.ruleState:'No upcoming fixtures submitted yet. Initial league backfill and selection rules are pending.';el('selection').className='warn';el('results').replaceChildren();for(const x of d.results){const tr=document.createElement('tr');for(const v of [x.fixture_id,new Date(x.kickoff*1000).toISOString().slice(0,16).replace('T',' '),x.home_id,x.hg+' : '+x.ag,x.away_id,x.league_id])cell(tr,v);el('results').append(tr)}}catch(e){el('status').textContent='Load failed: '+e.message}}load();
</script></html>`;
export default {async fetch(req,env){const p=new URL(req.url).pathname;if(req.method==='GET'&&p==='/preview')return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});if(req.method==='GET'&&p==='/preview-data')return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req);if(!env.OWNER_SECRET||req.headers.get('Authorization')!=='Bearer '+env.OWNER_SECRET)return new Response('Not found',{status:404});return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req)}};
