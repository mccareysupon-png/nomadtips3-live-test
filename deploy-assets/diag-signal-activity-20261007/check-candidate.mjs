import {activeVersion,getVersion,sha,publicFile,directOrigin} from '../daily-performance-20261005/production.mjs';

const candidate='5e5ca750-15ca-46c8-9c3c-e73f4d128811';
const base='c0d36092-044c-4f9a-b21f-26ba977c4c17';
const expected={
  'index.html':'8b44bb1c3bc2c7467f68eb66adb68c73f440ec7c81f8ad95ccfa6820d66dd1d4',
  'dashboard-v2-stage3.js':'4a68971914fb97dde366ce49f7b404bdceae6555f0198c369d6d0d1dc4ccb83e',
  'dashboard-v2-tune.css':'552e70cd21795590c13de5b9c61c5b6425b3d4c1b7a115f528885a6934778abb'
};
const out={checkedAt:new Date().toISOString(),active:await activeVersion(),base,candidate,expected,candidateModules:{},currentDirect:{}};
const v=await getVersion(candidate);
for(const p of Object.keys(expected)){
  const names=[p,'assets/'+p];
  const m=v.modules.find(x=>names.includes(x.name));
  out.candidateModules[p]=m?{name:m.name,sha:sha(Buffer.from(m.content_base64,'base64')),bytes:Buffer.from(m.content_base64,'base64').length,expected:expected[p],matches:sha(Buffer.from(m.content_base64,'base64'))===expected[p]}:{missing:true};
  try{
    const b=await publicFile('/'+p,undefined,directOrigin);
    out.currentDirect[p]={sha:sha(b),bytes:b.length};
  }catch(e){out.currentDirect[p]={error:e.message}}
}
console.log(JSON.stringify(out,null,2));
