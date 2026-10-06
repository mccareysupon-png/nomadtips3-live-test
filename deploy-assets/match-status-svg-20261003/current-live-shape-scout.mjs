import { activeVersion,getVersion,publicFile,literals,sha } from './production.mjs';
const id=await activeVersion();const v=await getVersion(id);const m=v.modules.find(x=>x.name===v.main_module);const source=Buffer.from(m.content_base64,'base64').toString('utf8');
const dash=await publicFile('/dashboard-v2-stage3.js','javascript').catch(e=>null);const idx=await publicFile('/index.html','html').catch(e=>null);
console.log('ACTIVE='+id);console.log('MAIN='+v.main_module);console.log('MODULES='+JSON.stringify(v.modules.map(x=>({name:x.name,type:x.content_type,size:x.content_base64?Buffer.from(x.content_base64,'base64').length:null}))));
console.log('ASSETS='+JSON.stringify(v.assets||null));console.log('BINDINGS='+JSON.stringify(v.bindings||null));
console.log('LITERALS='+JSON.stringify([...literals(source)].map(([name,e])=>({name,sha:sha(e.value),bytes:Buffer.byteLength(e.value)}))));
if(dash){const t=dash.toString('utf8');console.log('DASH_SHA='+sha(dash));console.log('DASH_NO_ACTIVE_COUNT='+(t.match(/No active signal/g)||[]).length);console.log('DASH_HEAD='+JSON.stringify(t.slice(0,300)))}else console.log('DASH_MISSING');
if(idx){const t=idx.toString('utf8');console.log('INDEX_SHA='+sha(idx));console.log('INDEX_NO_ACTIVE_COUNT='+(t.match(/No active signal/g)||[]).length);console.log('INDEX_BYTES='+idx.length);console.log('INDEX_HEAD='+JSON.stringify(t.slice(0,500)))}else console.log('INDEX_MISSING');
