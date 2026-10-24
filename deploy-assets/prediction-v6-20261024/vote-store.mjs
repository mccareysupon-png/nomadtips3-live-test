import {percentages,OUTCOMES} from './core.mjs';
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const bytesToHex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hexToBytes=s=>Uint8Array.from(s.match(/.{2}/g)||[],b=>parseInt(b,16));
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export class VoteIdentity{
 constructor(ctx){this.ctx=ctx;this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS issuance (ip TEXT NOT NULL, day INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(ip,day))');
  ctx.blockConcurrencyWhile(async()=>{let secret=await ctx.storage.get('identity-key-v1');if(!secret){secret=crypto.getRandomValues(new Uint8Array(32));await ctx.storage.put('identity-key-v1',secret);}this.key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);});
 }
 async fetch(request){const data=await request.json(),token=String(data.token||''),match=/^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token);let voter=null;
  if(match&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(match[1])&&await crypto.subtle.verify('HMAC',this.key,hexToBytes(match[2]),new TextEncoder().encode(match[1])))voter=match[1];
  if(voter)return json({ok:true,voter,newToken:null});
  if(!data.create)return json({ok:false,error:'SESSION_REQUIRED'},401);
  if(!validHash(data.ip))return json({ok:false,error:'CLIENT_UNAVAILABLE'},400);
  const day=Math.floor(Date.now()/86400000),allowed=this.ctx.storage.transactionSync(()=>{this.sql.exec('DELETE FROM issuance WHERE day < ?',day-2);const n=this.sql.exec('SELECT count FROM issuance WHERE ip=? AND day=?',data.ip,day).toArray()[0]?.count||0;if(n>=20)return false;this.sql.exec('INSERT INTO issuance(ip,day,count) VALUES(?,?,1) ON CONFLICT(ip,day) DO UPDATE SET count=count+1',data.ip,day);return true;});
  if(!allowed)return json({ok:false,error:'RATE_LIMITED'},429,{'retry-after':'3600'});
  voter=crypto.randomUUID();const signature=bytesToHex(await crypto.subtle.sign('HMAC',this.key,new TextEncoder().encode(voter)));return json({ok:true,voter,newToken:voter+'.'+signature});
 }
}
export class FixtureVoteStore{
 constructor(ctx){this.ctx=ctx;this.sql=ctx.storage.sql;
  this.sql.exec("CREATE TABLE IF NOT EXISTS votes (voter TEXT PRIMARY KEY, choice TEXT NOT NULL CHECK(choice IN ('1','X','2')), updated INTEGER NOT NULL)");
  this.sql.exec('CREATE TABLE IF NOT EXISTS limits (ip TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(ip,window))');
  this.sql.exec('CREATE TABLE IF NOT EXISTS identities (ip TEXT NOT NULL, voter TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY(ip,voter,day))');
 }
 summary(voter){const counts=[0,0,0];for(const r of this.sql.exec('SELECT choice,COUNT(*) AS count FROM votes GROUP BY choice').toArray())counts[OUTCOMES.indexOf(r.choice)]=r.count;return{ok:true,counts,total:counts.reduce((a,b)=>a+b,0),percentages:percentages(counts),myPick:voter?this.sql.exec('SELECT choice FROM votes WHERE voter=?',voter).toArray()[0]?.choice||null:null};}
 async fetch(request){const data=await request.json();if(!/^[a-f0-9-]{36}$/.test(data.voter||'')||!validHash(data.ip))return json({ok:false,error:'INVALID_SESSION'},400);
  if(data.method==='GET')return json(this.summary(data.voter));
  if(data.method!=='POST'||!OUTCOMES.includes(data.choice))return json({ok:false,error:'INVALID_CHOICE'},400);
  const now=Date.now(),minute=Math.floor(now/60000),day=Math.floor(now/86400000);
  const result=this.ctx.storage.transactionSync(()=>{
   this.sql.exec('DELETE FROM limits WHERE window < ?',minute-2);this.sql.exec('DELETE FROM identities WHERE day < ?',day-1);
   const attempts=this.sql.exec('SELECT count FROM limits WHERE ip=? AND window=?',data.ip,minute).toArray()[0]?.count||0;
   if(attempts>=20)return{limited:true,retry:60};
   const identity=this.sql.exec('SELECT voter FROM identities WHERE ip=? AND voter=? AND day=?',data.ip,data.voter,day).toArray()[0];
   if(!identity&&(this.sql.exec('SELECT COUNT(*) AS n FROM identities WHERE ip=? AND day=?',data.ip,day).toArray()[0]?.n||0)>=5)return{limited:true,retry:3600};
   this.sql.exec('INSERT INTO limits(ip,window,count) VALUES(?,?,1) ON CONFLICT(ip,window) DO UPDATE SET count=count+1',data.ip,minute);
   this.sql.exec('INSERT OR IGNORE INTO identities(ip,voter,day) VALUES(?,?,?)',data.ip,data.voter,day);
   this.sql.exec('INSERT INTO votes(voter,choice,updated) VALUES(?,?,?) ON CONFLICT(voter) DO UPDATE SET choice=excluded.choice,updated=excluded.updated',data.voter,data.choice,now);
   return this.summary(data.voter);
  });
  return result.limited?json({ok:false,error:'RATE_LIMITED'},429,{'retry-after':String(result.retry)}):json(result);
 }
}
export default {async fetch(request,env){try{
 const url=new URL(request.url);if(url.pathname==='/health')return json({ok:!!env.IDENTITY&&!!env.FIXTURES,component:'BALL46_PREDICTION_VOTES_V6',storage:'sqlite-durable-objects'});
 if(url.pathname!=='/vote'||request.method!=='POST')return json({ok:false,error:'NOT_FOUND'},404);
 const data=await request.json();if(!['production','preview'].includes(data.scope)||!/^\d{4,18}$/.test(data.fixtureId||'')||!['GET','POST'].includes(data.method)||!validHash(data.ip))return json({ok:false,error:'INVALID_INTERNAL_REQUEST'},400);
 const identity=env.IDENTITY.get(env.IDENTITY.idFromName('identity-v1')),session=await identity.fetch('https://identity.internal/session',{method:'POST',body:JSON.stringify({token:data.token,ip:data.ip,create:data.method==='GET'})}),who=await session.json();
 if(!session.ok)return json(who,session.status,session.headers.has('retry-after')?{'retry-after':session.headers.get('retry-after')}:{});
 const store=env.FIXTURES.get(env.FIXTURES.idFromName(data.scope+':'+data.fixtureId)),response=await store.fetch('https://votes.internal/tally',{method:'POST',body:JSON.stringify({method:data.method,voter:who.voter,ip:data.ip,choice:data.choice})}),tally=await response.json();
 if(!response.ok)return json(tally,response.status,response.headers.has('retry-after')?{'retry-after':response.headers.get('retry-after')}:{});
 return json({...tally,fixtureId:data.fixtureId,scope:data.scope,sessionToken:who.newToken});
 }catch{return json({ok:false,error:'VOTE_TEMPORARILY_UNAVAILABLE'},503)}}};
