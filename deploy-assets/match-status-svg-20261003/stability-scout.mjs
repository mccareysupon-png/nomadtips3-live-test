import { activeVersion,publicFile,sha } from './production.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
console.log('ACTIVE='+await activeVersion());
for(let i=1;i<=20;i++){
 const ts=Date.now();
 const [idx,dash,board,signals,stats]=await Promise.all([
  publicFile('/index.html','html').catch(e=>null),
  publicFile('/dashboard-v2-stage3.js','javascript').catch(e=>null),
  publicFile('/api/engine/board','json').catch(e=>null),
  publicFile('/api/engine/signals','json').catch(e=>null),
  publicFile('/api/engine/statistics','json').catch(e=>null)
 ]);
 let b={},s={},st={};
 try{b=board?JSON.parse(board):{}}catch{}
 try{s=signals?JSON.parse(signals):{}}catch{}
 try{st=stats?JSON.parse(stats):{}}catch{}
 console.log(JSON.stringify({
   i,ts,
   indexSha:idx?sha(idx):null,indexBytes:idx?.length||0,
   dashSha:dash?sha(dash):null,dashBytes:dash?.length||0,
   fixtures:Array.isArray(b?.fixtures)?b.fixtures.length:null,
   live:Array.isArray(b?.fixtures)?b.fixtures.filter(x=>String(x?.status?.short||x?.status||'').toUpperCase().includes('LIVE')).length:null,
   signals:Array.isArray(s?.signals)?s.signals.length:null,
   settled:Array.isArray(st?.rows)?st.rows.length:null,
   boardOk:b?.ok??null
 }));
 await delay(1000);
}