import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {inspect,publicFile,directOrigin,sha,activeVersion} from './production.mjs';
const current=await inspect();
const paths=readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
const report={version:current.restore.version,mainModule:current.version.main_module,modules:[],imports:parse(current.source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ImportDeclaration').map(n=>n.source.value)};
for(const module of current.version.modules.filter(m=>m.name!==current.version.main_module)){
 const path=module.name.replace(/^assets\//,'');
 assert(paths.includes(path),'MODULE_NOT_IN_CONFIRMED_ASSET_INVENTORY:'+module.name);
 const embedded=sha(Buffer.from(module.content_base64,'base64'));
 const direct=sha(await publicFile('/'+path,undefined,directOrigin));
 const publicHash=sha(await publicFile('/'+path));
 report.modules.push({name:module.name,type:module.content_type,path,embedded,direct,publicHash,identical:embedded===direct&&direct===publicHash});
 assert(embedded===direct&&direct===publicHash,'ACTUAL_CURRENT_MODULE_ASSET_MISMATCH:'+module.name);
}
assert.equal(await activeVersion(),current.restore.version,'PRODUCTION_MOVED_DURING_SCOUT');
console.log('RAIL_SCOUT='+JSON.stringify(report));
