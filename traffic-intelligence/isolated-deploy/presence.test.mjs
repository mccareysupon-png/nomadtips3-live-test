import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPresence,loadPresence,PRESENCE_PREFIX,RETENTION_SECONDS,ONLINE_MS} from './presence.mjs';
import collector from './collector.mjs';
const NOW=Date.UTC(2026,9,21,2);
const VID='11111111-1111-4111-8111-111111111111',VID2='22222222-2222-4222-8222-222222222222';
const SID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SID2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
class KV {
 data=new Map();puts=[];fail=false;
 async get(key,type){const row=this.data.get(key);return row?(type==='json'?JSON.parse(row.value):row.value):null;}
 async put(key,value,options={}){if(this.fail)throw Error('private_storage_error');this.puts.push({key,value,options});this.data.set(key,{value,...options});}
 async delete(key){this.data.delete(key);}
 async list({prefix,cursor,limit}){const rows=[...this.data].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b));const start=Number(cursor||0),end=start+limit;return {keys:rows.slice(start,end).map(([name,row])=>({name,metadata:row.metadata})),list_complete:end>=rows.length,cursor:end<rows.length?String(end):undefined};}
}
const setup=()=>({COLLECT_ENABLED:'true',EVENTS_KV:new KV(),PRESENCE_VISITOR_LIMIT:{async limit(){return {success:true};}},PRESENCE_NETWORK_LIMIT:{async limit(){return {success:true};}}});
const request=(overrides={},headers={})=>{const r=new Request('https://collector.invalid/api/collect',{method:'POST',headers:{Origin:'https://ball46.com','content-type':'application/json','CF-Connecting-IP':'192.0.2.51','User-Agent':'Mobile',...headers},body:JSON.stringify({v:1,type:'heartbeat',consent:true,vid:VID,sid:SID,path:'/',...overrides})});Object.defineProperty(r,'cf',{value:{country:'TH',city:'must-not-store'}});return r;};
test('disabled/unconfigured/never connected sources return null, never fake zero',async()=>{
 for(const env of [{},setup()]){const result=await loadPresence(env,NOW);assert.equal(result.status,'not_connected');assert.equal(result.online,null);assert.equal(result.unique24h,null);assert.equal(result.sessions24h,null);}
 assert.equal((await collectPresence(request(),{COLLECT_ENABLED:'false'},NOW)).status,503);
 assert.equal((await collectPresence(request(),{COLLECT_ENABLED:'true',EVENTS_KV:new KV()},NOW)).status,503);
});
test('explicit consent, exact main hosts, public paths and schema are mandatory',async()=>{
 const env=setup();
 for(const body of [{consent:false},{consent:null},{path:'/login'},{path:'/api/engine/board'},{path:'/?email=private'},{sid:'not-an-id'},{v:2},{email:'private@example.invalid'},{type:'view'}])assert.equal((await collectPresence(request(body),env,NOW)).status,400);
 for(const origin of ['https://member.ball46.com','https://ball46.com.attacker.invalid','null',''])assert.equal((await collectPresence(request({}, {Origin:origin}),env,NOW)).status,403);
 assert.equal(env.EVENTS_KV.puts.length,0);
 assert.equal((await collectPresence(request({}, {Origin:'https://www.ball46.com'}),env,NOW)).status,204);
});
test('DNT/GPC write no data, oversized and malformed requests fail before storage',async()=>{
 for(const key of ['DNT','Sec-GPC']){const env=setup();assert.equal((await collectPresence(request({}, {[key]:'1'}),env,NOW)).status,204);assert.equal(env.EVENTS_KV.puts.length,0);}
 const env=setup();assert.equal((await collectPresence(request({path:'x'.repeat(1000)}),env,NOW)).status,413);
 assert.equal((await collectPresence(request({}, {'content-type':'text/plain'}),env,NOW)).status,415);
 assert.equal((await collectPresence(new Request('https://collector.invalid/api/collect',{method:'POST',headers:{Origin:'https://ball46.com','content-type':'application/json'},body:'{' }),env,NOW)).status,400);
});
test('heartbeats deduplicate browsers across sessions and repeated tabs; time is server supplied',async()=>{
 const env=setup();
 for(const [body,time] of [[{},NOW-60000],[{},NOW-45000],[{sid:SID2},NOW-10000],[{vid:VID2},NOW-ONLINE_MS-1]])assert.equal((await collectPresence(request(body),env,time)).status,204);
 const report=await loadPresence(env,NOW);assert.equal(report.status,'connected');assert.equal(report.online,1);assert.equal(report.unique24h,2);assert.equal(report.sessions24h,3);
 const stored=JSON.stringify(env.EVENTS_KV.puts);for(const denied of [VID,SID,'192.0.2.51','must-not-store','email','referrer','ip_masked'])assert(!stored.includes(denied));
 const personal=env.EVENTS_KV.puts.filter(p=>p.options.metadata);assert(personal.every(p=>p.options.expirationTtl===RETENTION_SECONDS));
});
test('online window expires; genuinely connected inactive source may show zero',async()=>{
 const env=setup();await collectPresence(request(),env,NOW);
 assert.equal((await loadPresence(env,NOW+ONLINE_MS)).online,1);
 assert.equal((await loadPresence(env,NOW+ONLINE_MS+1)).online,0);
 const expired=await loadPresence(env,NOW+86400001);assert.equal(expired.status,'connected');assert.equal(expired.unique24h,0);assert.equal(expired.sessions24h,0);
});
test('revoke removes every session of that browser, preserves other browsers and permits GPC cleanup',async()=>{
 const env=setup();await collectPresence(request(),env,NOW);await collectPresence(request({sid:SID2}),env,NOW);await collectPresence(request({vid:VID2}),env,NOW);
 assert.equal((await collectPresence(request({type:'revoke',consent:false}, {'Sec-GPC':'1'}),env,NOW)).status,204);
 const report=await loadPresence(env,NOW);assert.equal(report.unique24h,1);assert.equal(report.sessions24h,1);
 await collectPresence(request(),env,NOW+1000);assert.equal((await loadPresence(env,NOW+1000)).unique24h,1,'late heartbeat cannot restore withdrawn browser');
});
test('rate limits and storage failure fail closed without leaking payload or exception',async()=>{
 for(const binding of ['PRESENCE_VISITOR_LIMIT','PRESENCE_NETWORK_LIMIT']){const env=setup();env[binding].limit=async()=>({success:false});assert.equal((await collectPresence(request(),env,NOW)).status,429);assert.equal(env.EVENTS_KV.puts.length,0);}
 const env=setup();env.EVENTS_KV.fail=true;const r=await collectPresence(request(),env,NOW);assert.equal(r.status,503);assert(!JSON.stringify(await r.json()).includes('private_storage_error'));assert.equal((await loadPresence(env,NOW)).online,null);
});
test('pagination is complete and an incomplete/capacity scan returns no partial totals',async()=>{
 const env=setup();await env.EVENTS_KV.put(PRESENCE_PREFIX+'connected',JSON.stringify({firstAcceptedAt:NOW}));
 for(let i=0;i<1001;i++)await env.EVENTS_KV.put(PRESENCE_PREFIX+'visitor/'+i,'1',{metadata:{at:NOW}});
 assert.equal((await loadPresence(env,NOW)).unique24h,1001);
 env.EVENTS_KV.list=async()=>({keys:[{name:'partial',metadata:{at:NOW}}],list_complete:false,cursor:'repeated'});
 const result=await loadPresence(env,NOW);assert.equal(result.status,'not_connected');assert.equal(result.unique24h,null);
});
test('Collector exposes only public script/privacy/health and write API, never private reports',async()=>{
 const env=setup();
 for(const path of ['/','/api/summary','/api/presence','/api/events'])assert.equal((await collector.fetch(new Request('https://collector.invalid'+path),env)).status,404);
 const script=await collector.fetch(new Request('https://collector.invalid/tracker.js'),env);assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
 assert.equal((await collector.fetch(new Request('https://collector.invalid/privacy'),env)).status,200);
 const preflight=await collector.fetch(new Request('https://collector.invalid/api/collect',{method:'OPTIONS',headers:{Origin:'https://ball46.com'}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://ball46.com');assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
});
