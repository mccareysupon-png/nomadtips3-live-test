import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto} from 'node:crypto';
import {verifyAccessIdentity} from '../src/access-auth.js';
const team='qa.cloudflareaccess.com',aud='qa-audience';
const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',kp.publicKey);jwk.kid='test-key';jwk.use='sig';
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=encode({alg:'RS256',kid:'test-key'});
const b=encode({sub:'test-id',email:'owner@example.com',iss:'https://'+team,aud:[aud],iat:now-20,exp:now+600});
const base=h+'.'+b;
const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(base))).toString('base64url');
const jwt=base+'.'+signature;
const f=globalThis.fetch;
globalThis.fetch=async(input,init)=>String(input).includes('/cdn-cgi/access/certs')?new Response(JSON.stringify({keys:[jwk]})):f(input,init);
const env={CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud};
const req=headers=>new Request('https://member2.ball46.com/api/member/daily',{headers});
test('verified assertion header is accepted',async()=>{const i=await verifyAccessIdentity(req({'Cf-Access-Jwt-Assertion':jwt}),env);assert.equal(i?.email,'owner@example.com')});
test('verified Cloudflare Access cookie is accepted',async()=>{const i=await verifyAccessIdentity(req({Cookie:'unrelated=1; CF_Authorization='+jwt}),env);assert.equal(i?.email,'owner@example.com')});
test('unsigned or forged cookie cannot bypass authorization',async()=>{const i=await verifyAccessIdentity(req({Cookie:'CF_Authorization='+jwt.slice(0,-8)+'12345678'}),env);assert.equal(i,null)});
test('missing identity denied',async()=>{assert.equal(await verifyAccessIdentity(req({}),env),null)});

test('invalid assertion still accepts independently signed valid Access cookie',async()=>{
  const bad=jwt.slice(0,-8)+'12345678';
  const i=await verifyAccessIdentity(req({'Cf-Access-Jwt-Assertion':bad,Cookie:'CF_Authorization='+jwt}),env);
  assert.equal(i?.email,'owner@example.com');
});
test('invalid assertion and invalid cookie fail closed',async()=>{
  const bad=jwt.slice(0,-8)+'12345678';
  assert.equal(await verifyAccessIdentity(req({'Cf-Access-Jwt-Assertion':bad,Cookie:'CF_Authorization='+bad}),env),null);
});
