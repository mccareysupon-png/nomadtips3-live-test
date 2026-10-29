import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProfileRequest,profileKey,validateProfile} from './profile-handler.mjs';

const member={status:'ACTIVE',displayName:'Member',plan:'BALL46 MEMBER',accessType:'SUBSCRIPTION',currentPeriodEnd:1900000000000,cancelAtPeriodEnd:false};
const payload={version:0,displayName:'Member One',avatar:null,locale:'en',timeZone:'Asia/Bangkok',reducedMotion:false};
const request=(body,headers={})=>new Request('https://member.ball46.com/api/member/profile',body===undefined?{}:{method:'PUT',headers:{origin:'https://member.ball46.com','content-type':'application/json',...headers},body:JSON.stringify(body)});
function setup(email='first@example.test'){
  const database=new DatabaseSync(':memory:');database.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const env={MEMBER_PROFILES:{prepare(sql){return {bind(...values){return {async first(){return database.prepare(sql).get(...values)||null;},async run(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};}};}}};
  const auth={verifyAccessIdentity:async()=>({email}),memberAccess:async()=>member};
  return {database,env,auth};
}
test('profile data survives save and reload for an existing member without modifying entitlement',async()=>{
  const {database,env,auth}=setup();
  try{
    const initial=await (await handleProfileRequest(request(),env,auth)).json();assert.equal(initial.profile.version,0);assert.equal(initial.profile.membership.status,'ACTIVE');
    const saved=await handleProfileRequest(request(payload),env,auth);assert.equal(saved.status,200);
    const reloaded=await (await handleProfileRequest(request(),env,auth)).json();assert.equal(reloaded.profile.displayName,'Member One');assert.equal(reloaded.profile.version,1);assert.equal(reloaded.profile.email,'first@example.test');assert.deepEqual(reloaded.profile.membership,initial.profile.membership);
    const next=await (await handleProfileRequest(request({...payload,version:1,displayName:'สมาชิกคนแรก',locale:'th',reducedMotion:true}),env,auth)).json();assert.equal(next.profile.version,2);assert.equal(next.profile.displayName,'สมาชิกคนแรก');assert.equal(next.profile.reducedMotion,true);
  }finally{database.close();}
});
test('the same implementation isolates all members and ignores client identity overrides',async()=>{
  const {database,env,auth}=setup();try{
    await handleProfileRequest(request(payload),env,auth);
    const other={...auth,verifyAccessIdentity:async()=>({email:'second@example.test'})};
    const response=await (await handleProfileRequest(request(),env,other)).json();assert.equal(response.profile.version,0);assert.equal(response.profile.email,'second@example.test');
    assert.equal((await handleProfileRequest(request({...payload,email:'first@example.test'}),env,other)).status,400);
    assert.equal((await handleProfileRequest(request({...payload,displayName:'Second'}),env,other)).status,200);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM member_profiles').get().count,2);
  }finally{database.close();}
});
test('stale writes and duplicate first writes return conflict',async()=>{
  const {database,env,auth}=setup();try{assert.equal((await handleProfileRequest(request(payload),env,auth)).status,200);assert.equal((await handleProfileRequest(request(payload),env,auth)).status,409);assert.equal((await handleProfileRequest(request({...payload,version:7}),env,auth)).status,409);}finally{database.close();}
});
test('unauthenticated and unpaid requests cannot read or write',async()=>{
  const {database,env,auth}=setup();try{for(const blocked of [{...auth,verifyAccessIdentity:async()=>null},{...auth,memberAccess:async()=>null},{...auth,memberAccess:async()=>({...member,status:'EXPIRED'})}]){assert.equal((await handleProfileRequest(request(),env,blocked)).status,401);assert.equal((await handleProfileRequest(request(payload),env,blocked)).status,401);}assert.equal(database.prepare('SELECT COUNT(*) AS count FROM member_profiles').get().count,0);}finally{database.close();}
});
test('CSRF, invalid MIME and oversized requests fail before writes',async()=>{
  const {database,env,auth}=setup();try{assert.equal((await handleProfileRequest(request(payload,{origin:'https://evil.example'}),env,auth)).status,403);assert.equal((await handleProfileRequest(request(payload,{'content-type':'text/plain'}),env,auth)).status,415);assert.equal((await handleProfileRequest(request({...payload,displayName:'x'.repeat(310000)}),env,auth)).status,413);assert.equal(database.prepare('SELECT COUNT(*) AS count FROM member_profiles').get().count,0);}finally{database.close();}
});
test('invalid and protected fields never persist',async()=>{
  const {database,env,auth}=setup();try{for(const changes of [{displayName:'  '},{displayName:'x'.repeat(61)},{displayName:'bad\u0001name'},{locale:'xx'},{timeZone:'Invalid/Zone'},{reducedMotion:'true'},{avatar:'data:image/svg+xml;base64,PHN2Zz4='},{avatar:'data:image/png;base64,aGVsbG8='},{status:'ACTIVE'},{plan:'premium'},{version:-1}])assert.equal((await handleProfileRequest(request({...payload,...changes}),env,auth)).status,400,JSON.stringify(changes));assert.equal(database.prepare('SELECT COUNT(*) AS count FROM member_profiles').get().count,0);}finally{database.close();}
});
test('missing storage fails closed and unrelated routes pass through unchanged',async()=>{
  const {database,auth}=setup();try{assert.equal((await handleProfileRequest(request(),{},auth)).status,503);assert.equal(await handleProfileRequest(new Request('https://member.ball46.com/api/member/daily'),{},auth),null);assert.equal(await handleProfileRequest(new Request('https://member.ball46.com/member'),{},auth),null);}finally{database.close();}
});
test('keys are stable and names preserve international text',async()=>{assert.equal(await profileKey(' FIRST@example.test '),await profileKey('first@example.test'));assert.notEqual(await profileKey('first@example.test'),await profileKey('second@example.test'));assert.equal(validateProfile({...payload,displayName:'  สมชาย   ใจดี  '}).displayName,'สมชาย ใจดี');});
test('profile page stays behind existing membership authorization',async()=>{
  const {database,env,auth}=setup();try{
    env.ASSETS={fetch:async()=>new Response('<html>profile</html>',{headers:{'content-type':'text/html'}})};
    const page=new Request('https://member.ball46.com/member?view=profile');
    const response=await handleProfileRequest(page,env,auth);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await handleProfileRequest(page,env,{...auth,memberAccess:async()=>null})).status,401);
  }finally{database.close();}
});
