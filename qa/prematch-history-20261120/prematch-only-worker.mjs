import {DurableObject} from 'cloudflare:workers';
import {init,ingest,normalize,totals,coverage} from './history.mjs';
const json=x=>Response.json(x,{headers:{'cache-control':'no-store'}});
export class PrematchStore extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};init(this.db)}
 async fetch(req){
 const path=new URL(req.url).pathname,now=Math.floor(Date.now()/1000);
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
 return json({system:'BALL46_PREMATCH_ONLY',rows,published:0,ruleState:'NO_APPROVED_NUMERIC_THRESHOLDS_INSTALLED'});
 }
 return new Response('Not found',{status:404})
 }}
export default {async fetch(req,env){if(!env.OWNER_SECRET||req.headers.get('Authorization')!=='Bearer '+env.OWNER_SECRET)return new Response('Not found',{status:404});return env.STORE.get(env.STORE.idFromName('prematch-only-v1')).fetch(req)}};
