import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='dc707e65-55cf-426c-82d9-d0b8124b0e40';
export const SCRIPT='ball46-production';
export const MARK='B46_TEAM_KITS_ONLY_20261015';
export const ORIGINAL_MAIN='ddfc09cc46e8963a21d9e76e146b936f5243e50860693545d9569104c2a099cc';
export const ORIGINAL_KITS='b12fb102b6cd90873c0ea2c196e629618014853f6a01b0cc8b0caf228be1d1f2';
export const CANDIDATE_KITS='ee7084e051d455af5959df298e65ee940019b7f51c6ad4c8f1ff9c37a404e5e6';
export function patchMain(source,kits){
 assert.equal(sha(source),ORIGINAL_MAIN,'ACTIVE_MAIN_DRIFT');assert.equal(sha(kits),CANDIDATE_KITS,'KIT_CANDIDATE_DRIFT');
 const declaration=`const __B46_TEAM_KITS_ONLY_JS_20261015__=${JSON.stringify(kits)};\n`;
 const exportAnchor='export default {...__B46_BASE_WORKER__,async fetch(request,env,ctx){const url=new URL(request.url);if(request.method===\'GET\'){';
 const guard="if(url.pathname==='/team-kits-343.js')return __b46Text(__B46_TEAM_KITS_ONLY_JS_20261015__,'application/javascript; charset=utf-8');";
 assert.equal(source.split(exportAnchor).length-1,1,'WORKER_EXPORT_ANCHOR');
 const patched=source.replace(exportAnchor,declaration+exportAnchor+guard);
 assert.equal(patched.replace(declaration,'').replace(guard,''),source,'UNRELATED_WORKER_BYTES_CHANGED');
 return patched;
}
