import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourcePath=new URL('./run.mjs',import.meta.url);
const generatedPath=new URL('./run-generated.mjs',import.meta.url);
let source=readFileSync(sourcePath,'utf8');
const oldLine="    for(const [path,expected] of Object.entries(protectedBefore))assert.equal(sha((await publicBytes(path)).bytes),expected,`UNRELATED_PUBLIC_FILE_CHANGED:${path}`);";
const replacement=`    let protectedStable=false,lastProtectedDiff={};\n    for(let attempt=1;attempt<=20;attempt++){\n      const now=await activeVersion();\n      assert.equal(now,candidate,\`PRODUCTION_MOVED_DURING_PROTECTED_CONVERGENCE:\${candidate}->\${now}\`);\n      assert(await owned(candidate),'CANDIDATE_OWNERSHIP_CHANGED_DURING_PROTECTED_CONVERGENCE');\n      const diff={};\n      for(const [path,expected] of Object.entries(protectedBefore)){\n        const got=sha((await publicBytes(path)).bytes);\n        if(got!==expected)diff[path]={expected,got};\n      }\n      lastProtectedDiff=diff;\n      report.protectedConvergence={attempt,stable:Object.keys(diff).length===0,lastDiff:diff};save();\n      if(Object.keys(diff).length===0){protectedStable=true;console.log(\`PROTECTED_ASSET_CONVERGENCE_PASS attempt=\${attempt}\`);break;}\n      console.log(\`PROTECTED_ASSET_CONVERGENCE_WAIT attempt=\${attempt} diff=\${JSON.stringify(diff)}\`);\n      await delay(3000);\n    }\n    assert(protectedStable,\`PROTECTED_PUBLIC_FILES_DID_NOT_CONVERGE:\${JSON.stringify(lastProtectedDiff)}\`);`;
const hits=source.split(oldLine).length-1;
if(hits!==1)throw Error(`PROTECTED_VERIFY_ANCHOR_COUNT_${hits}`);
source=source.replace(oldLine,replacement);
writeFileSync(generatedPath,source);
execFileSync(process.execPath,['--check',generatedPath.pathname],{stdio:'inherit'});
console.log('CONVERGENCE_GUARD_GENERATED_OK');
await import('./run-generated.mjs?run='+Date.now());
