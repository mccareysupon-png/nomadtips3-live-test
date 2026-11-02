import assert from'node:assert/strict';
export function uploadBindings(bindings){return bindings.map(b=>['secret_text','secret_key'].includes(b.type)?{name:b.name,type:'inherit',version_id:'latest'}:{...b});}
export function assertLatestSecretSource(list,active){const rows=Array.isArray(list)?list:list.items||list.versions||[];assert(rows.length>0,'SECRET_SOURCE_VERSION_LIST_EMPTY');const latest=[...rows].sort((a,b)=>(b.number??0)-(a.number??0))[0];assert.equal(latest.id,active,'LATEST_UPLOADED_SECRET_SOURCE_NOT_ACTIVE');return latest.id;}
