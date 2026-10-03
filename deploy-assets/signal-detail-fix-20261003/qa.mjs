import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const chrome=process.env.CHROME_BIN;
assert(chrome,'CHROME_BIN_MISSING');
const port=9223;
const profile='/tmp/b46-signal-detail-qa';
rmSync(profile,{recursive:true,force:true});
mkdirSync('audit',{recursive:true});
const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'https://ball46.com/index.html?signalDetailQA='+Date.now()],{stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function pages(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json`);if(r.ok)return await r.json();}catch{}await delay(250);}throw new Error('CHROME_CDP_NOT_READY');}

try{
  const list=await pages(); const page=list.find(x=>x.type==='page'); assert(page?.webSocketDebuggerUrl,'NO_CHROME_PAGE');
  const ws=new WebSocket(page.webSocketDebuggerUrl); let id=0; const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  await call('Runtime.enable');
  for(let i=0;i<40;i++){
    const r=await call('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
    if(r.result?.value==='complete')break;
    await delay(250);
  }
  await delay(1500);
  const expression=`(async()=>{
    const response=await fetch('/ui-sync-fixes-343-v2.js?qa='+Date.now(),{cache:'no-store'});
    const source=await response.text();
    const oldSelector=${JSON.stringify("document.querySelectorAll('[data-signal-count],[data-workspace-signal-count]').forEach(el=>el.textContent=String(count))")};
    const newSelector=${JSON.stringify("document.querySelectorAll('[data-signal-count]:not(.signal-inline-stack),[data-workspace-signal-count]').forEach(el=>el.textContent=String(count))")};
    const detail=document.createElement('div');detail.id='b46-signal-detail-qa';detail.className='signal-inline-stack';detail.setAttribute('data-signal-count','1');detail.innerHTML='<div class="signal-cell locked prediction-live"><span class="pred-main">AH · HOME +1.5</span><span class="pred-sub">@ 1.75</span></div>';document.body.appendChild(detail);
    const counter=document.createElement('span');counter.id='b46-signal-counter-qa';counter.setAttribute('data-workspace-signal-count','');counter.textContent='0';document.body.appendChild(counter);
    const before=detail.textContent;
    window.dispatchEvent(new CustomEvent('ball46:signals-snapshot',{detail:{signals:[{fixtureId:'__b46_qa__',market:'AH',selection:'HOME',line:1.5,odds:1.75}]}}));
    await new Promise(r=>setTimeout(r,220));
    const result={http:response.status,patchHeader:response.headers.get('x-ball46-signal-detail-persist'),sourceHeader:response.headers.get('x-ball46-signal-detail-source'),oldAbsent:!source.includes(oldSelector),newPresent:source.includes(newSelector),before,after:detail.textContent,count:counter.textContent};
    detail.remove();counter.remove();return result;
  })()`;
  const evaluated=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(evaluated.exceptionDetails)throw new Error('BROWSER_EXCEPTION:'+JSON.stringify(evaluated.exceptionDetails));
  const result=evaluated.result?.value; writeFileSync('audit/browser-qa.json',JSON.stringify(result,null,2));
  assert.equal(result?.http,200,'TARGET_JS_HTTP_BAD');
  assert.equal(result?.sourceHeader,'patched','TARGET_JS_SOURCE_NOT_PATCHED');
  assert.equal(result?.oldAbsent,true,'OLD_SELECTOR_PRESENT_IN_BROWSER_SOURCE');
  assert.equal(result?.newPresent,true,'NEW_SELECTOR_MISSING_IN_BROWSER_SOURCE');
  assert.equal(result?.after,result?.before,'SIGNAL_DETAIL_WAS_OVERWRITTEN');
  assert.equal(result?.count,'1','SIGNAL_COUNT_WIDGET_NO_LONGER_UPDATES');
  assert(String(result?.patchHeader||'').includes('B46_SIGNAL_DETAIL_PERSIST_20261003'),'PATCH_HEADER_BAD');
  console.log('BROWSER_SIGNAL_DETAIL_PERSIST_QA_PASS',result);
  ws.close();
}finally{
  child.kill('SIGTERM');
  await delay(250);
  if(!child.killed)child.kill('SIGKILL');
  if(stderr)writeFileSync('audit/chrome-stderr.log',stderr);
}
