import{readFileSync}from'node:fs';import assert from'node:assert/strict';import{sha,patchHTML as patch}from'./patch.mjs';
export{sha};export const BASE='1f6499e3-6faf-408c-b47a-0b18d700b228',MARK='B46_FRONTEND_SPEED_SAFE_20261101',patchHTML=patch;
export function patchMain(source){const plan=JSON.parse(readFileSync('candidate/runtime-plan.json'));assert.equal(sha(source),plan.sourceSha,'LATEST_SOURCE_REQUIRED');const out=readFileSync('candidate/worker-runtime.mjs','utf8');assert.equal(sha(out),plan.candidateSha);return out}
export async function assetRecords(){const rows=JSON.parse(readFileSync('candidate/frontend-speed-v1-assets-20261101.txt'));assert.equal(rows.length,1);return rows.map(row=>({...row,path:row.path+'?v=b46-frontend-speed-v1-20261101'}))}
