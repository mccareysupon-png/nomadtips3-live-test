import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchGoaloo} from '../src/worker.mjs';
test('Cloudflare Worker fetch explicitly uses supported redirect manual',async()=>{
 let calls=0;
 const raw="var A=[]; A[0]=['123','1','','','Home','Away','2026-10-18 12:00:00','','-1','2','1'];";
 const f=async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  assert.match(url,/^https:\/\/live10\.goaloo28\.com\//);
  return {ok:true,status:200,headers:new Headers({'content-length':String(raw.length)}),text:async()=>raw};
 };
 assert.equal(await fetchGoaloo(f),raw);assert.equal(calls,1);
});
test('Cloudflare redirect responses are never followed to unverified hosts',async()=>{
 const visits=[];
 const f=async(url,opts)=>{
  visits.push(url);
  assert.equal(opts.redirect,'manual');
  return{ok:false,status:302,headers:new Headers({'location':'https://untrusted.example'}),text:async()=>{throw Error('FOLLOWED_REDIRECT')}};
 };
 await assert.rejects(fetchGoaloo(f),/GOALOO_FEED_UNAVAILABLE/);
 assert.equal(visits.length,2);
 assert.ok(visits.every(url=>new URL(url).hostname==='live10.goaloo28.com'));
});
test('fallback to the second approved Goaloo URL',async()=>{
 let count=0;
 const f=async(_url,opts)=>{
  assert.equal(opts.redirect,'manual');
  count++;
  if(count===1)return{ok:false,status:503,headers:new Headers()};
  return{ok:true,status:200,headers:new Headers(),
   text:async()=>"var A=[]; A[1]=['g','l','','','A','B','2026-10-18 12:00:00','','-1','1','0'];"};
 };
 assert.match(await fetchGoaloo(f),/A\[1\]/);
 assert.equal(count,2);
});
