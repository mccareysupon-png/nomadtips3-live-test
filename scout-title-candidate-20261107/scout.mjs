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
