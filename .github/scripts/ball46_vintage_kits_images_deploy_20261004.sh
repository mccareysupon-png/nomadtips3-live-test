#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
mkdir -p audit/vintage-kits-images
npm ci --ignore-scripts --no-audit --no-fund
node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs';
import { activeVersion, getVersion, publicFile, sha, directOrigin, origin } from './production.mjs';

const id=await activeVersion();
const version=await getVersion(id);
const rows=[];
for(const module of version.modules){
  const bytes=Buffer.from(module.content_base64,'base64');
  const row={name:module.name,content_type:module.content_type,bytes:bytes.length,sha256:sha(bytes),publicChecks:[]};
  const candidates=[];
  if(module.name.startsWith('assets/')) candidates.push('/'+module.name.slice('assets/'.length));
  else candidates.push('/'+module.name);
  for(const path of [...new Set(candidates)]){
    for(const base of [directOrigin,origin]){
      try{
        const pub=await publicFile(path,undefined,base);
        row.publicChecks.push({base,path,ok:true,bytes:pub.length,sha256:sha(pub),identical:sha(pub)===row.sha256});
      }catch(error){
        row.publicChecks.push({base,path,ok:false,error:String(error.message||error)});
      }
    }
  }
  rows.push(row);
}
const report={checkedAt:new Date().toISOString(),activeVersion:id,main_module:version.main_module,compatibility_date:version.compatibility_date,compatibility_flags:version.compatibility_flags||[],bindings:(version.bindings||[]).map(b=>({type:b.type,name:b.name||null,service:b.service||null,environment:b.environment||null})),assetsConfig:version.assets?.config||null,modules:rows};
writeFileSync('audit/vintage-kits-images/module-shape.json',JSON.stringify(report,null,2));
console.log(`ACTIVE_VERSION=${id}`);
console.log(`MAIN_MODULE=${version.main_module}`);
console.log(`MODULE_COUNT=${rows.length}`);
for(const row of rows) console.log(`MODULE=${row.name}|${row.content_type}|${row.sha256}|${row.publicChecks.map(x=>`${x.base.includes('workers.dev')?'direct':'public'}:${x.path}:${x.ok?x.identical?'same':'different':'missing'}`).join(',')}`);
console.log('READ_ONLY_MODULE_SHAPE_SUCCESS');
NODE
