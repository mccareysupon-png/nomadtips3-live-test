import {DurableObject} from 'cloudflare:workers';
import {init,ingest,coverage,totals} from './history.mjs';
import {seed,base} from './sample.mjs';
export class History extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.db={exec:(q,...a)=>ctx.storage.sql.exec(q,...a),transaction:f=>ctx.storage.transactionSync(f)};init(this.db)}
 async fetch(req){
  if(req.method!=='GET'||new URL(req.url).pathname!=='/health')return new Response('Test only',{status:404});
  // Synthetic fixtures only; idempotent bootstrap; no real external network.
  const obs=base+86400;
  if(totals(this.db).fixtures===0)ingest(this.db,seed(),obs);
  const t=totals(this.db),a=coverage(this.db,1,obs+100,obs),b=coverage(this.db,2,obs+100,obs);
  return Response.json({mode:'ISOLATED_SYNTHETIC_HISTORY',upstreamCalls:0,liveBindings:0,fixtures:t.fixtures,finished:t.finished,unknown:t.unknown,team1:a.count,team2:b.count,complete:a.complete&&b.complete},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 }
}
export default {async fetch(req,env){
 if(req.method!=='GET'||!['/','/health'].includes(new URL(req.url).pathname))return new Response('Test only',{status:404});
 return env.HISTORY.get(env.HISTORY.idFromName('phase2-fixture-test-v1')).fetch('https://test.invalid/health');
}};
