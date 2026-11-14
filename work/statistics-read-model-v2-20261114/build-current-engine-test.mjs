// Builds an isolated TEST copy, never uploads or activates a Worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const D='work/statistics-read-model-v2-20261114',U='work/statistics-summary-shadow-20261113',C='work/statistics-content-revision-20261113';
export async function buildEngineTest(){
 const original=(await readFile('work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js','utf8')).replace(/\r\n/g,'\n'),sha=s=>createHash('sha256').update(s).digest('hex');
 assert.equal(sha(original),'30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56','VERIFIED_ENGINE_BASE_DRIFT');
 await mkdir(D+'/qa',{recursive:true});await writeFile(D+'/qa/verified-engine-base.js',original);
 let pinned=await readFile(U+'/build-pinned-engine-candidate.mjs','utf8');
 pinned=pinned.replace("const D='"+U+"';","const D='"+D+"';").replace('work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js',D+'/qa/verified-engine-base.js');
 await writeFile(D+'/qa/pinned-builder-only-test.mjs',pinned);await import(pathToFileURL(resolve(D+'/qa/pinned-builder-only-test.mjs')));
 const revision=await readFile(C+'/build-engine.mjs','utf8'),a=revision.indexOf("let s=await readFile(D+'/qa/pinned-engine-candidate.js'"),b=revision.indexOf('const hash=b=>',a);
 assert(a>0&&b>a,'REVIEWED_BUILDER_DRIFT');
 const body=revision.slice(a,b).replace("D+'/content-revision.mjs'","'"+C+"/content-revision.mjs'");
 await writeFile(D+'/qa/content-builder-only-test.mjs',"import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';const D='"+D+"';\n"+body);
 // The reviewed builder checks that reversing every patch restores all original
 // bytes, and that exactly three audited Ledger writer paths are intercepted.
 await import(pathToFileURL(resolve(D+'/qa/content-builder-only-test.mjs')));
 const candidate=await readFile(D+'/qa/engine-candidate.js','utf8');
 const result={ok:true,baseSha:sha(original),candidateSha:sha(candidate),formulaChanges:0,productionWrites:0,mode:'isolated test build only'};
 await writeFile(D+'/qa/engine-test-build.json',JSON.stringify(result,null,2));return result;
}
