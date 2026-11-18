// Read-only registry contract verification; no browser credentials and no writes.
import vm from 'node:vm';
import {collect} from './shadow-seed-snapshot.mjs';
import {marketGroup} from './market-groups-stage.mjs';
const host='https://www.ball46.com';
const res=await fetch(host+'/market-registry-343.js',{headers:{accept:'application/javascript','user-agent':'Mozilla/5.0 B46-ReadOnly'},signal:AbortSignal.timeout(20000)});
if(!res.ok)throw Error('REGISTRY_HTTP_'+res.status);
const code=await res.text(),sandbox={window:{}};vm.runInNewContext(code,sandbox,{timeout:2000});
const registry=sandbox.window.BALL46_MARKET_REGISTRY;
if(typeof registry?.resolve!=='function')throw Error('REGISTRY_CONTRACT');
const source=await collect({includeRaw:true});
const families={all:'all',AH:'ah','1X2':'1x2','O/U':'ou',Corners:'corners',BTTS:'btts',Cards:'cards',Other:'other'};
const mapping={},variants=new Set(),mismatches=[];
for(const row of source.rawRows){
 const d=registry.resolve(row),raw=String(row.market??''),family=marketGroup(raw);
 const key=String(d?.key??''),f=String(d?.family??'');variants.add(key);
 const k=raw+'|'+key+'|'+f;mapping[k]=(mapping[k]??0)+1;
 if((d&&key!==raw)||(d?.family&&f!==families[family]))if(mismatches.length<20)mismatches.push({market:raw,key,family:f});
}
console.log('NATIVE_FILTER_REGISTRY='+JSON.stringify({rows:source.rawRows.length,mapping,variants:[...variants],mismatches,registryKeys:Object.keys(registry)}));
