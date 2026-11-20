import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const base='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const secret=crypto.createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function get(path){const r=await fetch(base+path,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});if(!r.ok)return {http:r.status};return await r.json()}
const p=await get('/preview-data'),b=await get('/bot-state'),d=await get('/dry-run');assert(p.system==='BALL46_PREMATCH_ONLY');
console.log('READ_ONLY_COUNTS '+JSON.stringify({stored:p.stored,teams:p.teams,teamsWith10:p.teamsWith10,bot:b,adapter:d}));
