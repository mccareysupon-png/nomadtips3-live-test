// Read-only inspection of current BALL46 Worker modules for stage validation.
// No POST, PUT, PATCH, DELETE, activation, or deployment is performed.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCRIPT = 'ball46-production';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const dest = process.argv[2] || 'tmp-mobile-favorites-off-source';
assert(account && token, 'MISSING_READONLY_SOURCE_CREDENTIALS');
const root = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';

async function get(path) {
  const response = await fetch(root+path, {
    method:'GET',
    headers:{ Authorization:'Bearer '+token },
    signal:AbortSignal.timeout(60000)
  });
  const body = await response.json();
  assert(response.ok && body.success === true, 'CLOUDFLARE_READ_FAILED_' + response.status);
  return body.result;
}
const deploy = await get('/scripts/'+SCRIPT+'/deployments?per_page=5');
const versions = deploy.deployments?.[0]?.versions;
assert(versions?.length === 1 && Number(versions[0].percentage) === 100, 'NOT_SINGLE_ACTIVE_VERSION');
const active = versions[0].version_id;
const version = await get('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const required = ['index.js','screen-refresh-5s-20261104.txt','assets/index.html'];
for (const name of required) {
  const m=version.modules?.find(m=>m.name===name);
  assert(m?.content_base64, 'REQUIRED_SOURCE_MISSING_'+name);
  const content=Buffer.from(m.content_base64,'base64').toString('utf8');
  if (name==='screen-refresh-5s-20261104.txt') { const signatures=[...content.matchAll(/function\s+b46Pin[A-Za-z0-9_]*\s*\([^)]*\)\s*\{/g)].map(x=>x[0]);console.log('PIN_FUNCTION_SIGNATURES='+JSON.stringify(signatures.slice(0,32))); }
  assert(content.length>0, 'SOURCE_EMPTY_'+name);
  if (name==='assets/index.html') assert(content.includes('B46_PIN_V2_MOBILE_20261111'),'MOBILE_PIN_BASE_MISSING');
  else assert(content.includes('B46_PIN_V2_FRESH_20261111'),'PIN_BASE_MISSING_'+name);
  const path=join(dest,name);
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,content);
}
console.log('CLOUDFLARE_METHOD=GET_ONLY');
console.log('READONLY_ACTIVE_VERSION='+active);
console.log('REQUIRED_MODULES=3');
console.log('SOURCE_BASE_VERIFIED=1');
console.log('PRODUCTION_DEPLOY=0');
