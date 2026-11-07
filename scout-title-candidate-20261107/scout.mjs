import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function api(path){
  const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);
  return j.result;
}
const deps=await api(`/scripts/${SCRIPT}/deployments?per_page=10`);
console.log('DEPLOYMENTS='+JSON.stringify(deps.deployments?.slice(0,5).map(d=>({id:d.id,created_on:d.created_on,versions:d.versions}))));
const versions=await api(`/scripts/${SCRIPT}/versions?per_page=20`);
const arr=versions.items||versions.versions||versions;
console.log('VERSIONS='+JSON.stringify((Array.isArray(arr)?arr:[]).slice(0,20).map(v=>({id:v.id,created_on:v.created_on,annotations:v.annotations}))));
const tagged=(Array.isArray(arr)?arr:[]).find(v=>v.annotations?.['workers/tag']==='B46_TITLE_LIVE_PREDICTIONS_20261107');
if(tagged){
  console.log('TAGGED_VERSION='+tagged.id);
  const v=await api(`/workers/${SCRIPT}/versions/${tagged.id}?include=modules`);
  const main=v.modules.find(m=>m.name===v.main_module)||v.modules.find(m=>m.name==='index.js');
  const t=Buffer.from(main.content_base64,'base64').toString('utf8');
  console.log('TAGGED_MAIN_SHA='+sha(Buffer.from(main.content_base64,'base64')));
  console.log('HAS_NEW='+t.includes('BALL46 | Live Predictions, Football Scores &amp; Signals'));
  console.log('HAS_OLD='+t.includes('BALL46 | Live Betting Tips, Football Scores &amp; Signals'));
  const i=t.indexOf('BALL46 | Live Predictions');
  if(i>=0) console.log('CONTEXT='+t.slice(Math.max(0,i-220),i+420).replace(/\n/g,'\\n'));
}

const activeDep=(await api(`/scripts/${SCRIPT}/deployments?per_page=5`)).deployments?.[0]?.versions?.find(x=>Number(x.percentage)===100);
if(activeDep&&tagged){
  const bv=await api(`/workers/${SCRIPT}/versions/${activeDep.version_id}?include=modules`);
  const cv=await api(`/workers/${SCRIPT}/versions/${tagged.id}?include=modules`);
  const bm=bv.modules.find(m=>m.name===bv.main_module)||bv.modules.find(m=>m.name==='index.js');
  const cm=cv.modules.find(m=>m.name===cv.main_module)||cv.modules.find(m=>m.name==='index.js');
  const bb=Buffer.from(bm.content_base64,'base64');
  const cb=Buffer.from(cm.content_base64,'base64');
  console.log('ACTIVE_VERSION_NOW='+activeDep.version_id);
  console.log('BASE_MAIN_LEN='+bb.length);
  console.log('CAND_MAIN_LEN='+cb.length);
  let p=0; while(p<bb.length&&p<cb.length&&bb[p]===cb[p])p++;
  let bs=bb.length-1, cs=cb.length-1;
  while(bs>=p&&cs>=p&&bb[bs]===cb[cs]){bs--;cs--;}
  console.log('DIFF_PREFIX='+p);
  console.log('DIFF_BASE_RANGE='+p+'..'+bs);
  console.log('DIFF_CAND_RANGE='+p+'..'+cs);
  console.log('BASE_DIFF='+bb.subarray(Math.max(0,p-220),Math.min(bb.length,bs+1+700)).toString('utf8').replace(/\n/g,'\\n'));
  console.log('CAND_DIFF='+cb.subarray(Math.max(0,p-220),Math.min(cb.length,cs+1+700)).toString('utf8').replace(/\n/g,'\\n'));
}
