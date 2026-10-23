import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const WORKER='ball46-production';
export const BASE='8867d39d-f381-4261-8d05-5b429926353b';
export const JS_PATH='/signal-next.js',HTML_PATH='/signal.html';
export const VERSION_TAG='b46-signal-standalone-fetch-20261023';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const oldAnchor="window.addEventListener('beforeunload',stop,{once:true});";
const lines=[
  '/* BALL46_SIGNAL_STANDALONE_FETCH_20261023: isolated /signal.html bootstrap */',
  "if(window.location.pathname==='/signal.html'){",
  '  start();',
  '  let signalRequestInFlight=false;',
  '  async function loadStandaloneSignals(){',
  '    if(signalRequestInFlight)return;',
  '    signalRequestInFlight=true;',
  '    try{',
  "      const response=await fetch('/api/engine/signals',{cache:'no-store',credentials:'same-origin'});",
  "      if(!response.ok)throw new Error('SIGNALS_HTTP_'+response.status);",
  '      const payload=await response.json();',
  "      if(payload?.ok!==true||!Array.isArray(payload?.signals))throw new Error('SIGNALS_PAYLOAD_INVALID');",
  '      consume(payload.signals);',
  '    }catch(error){',
  "      console.warn('BALL46 standalone signal refresh failed',error);",
  "      state('error','Signal feed temporarily unavailable · retrying');",
  '    }finally{signalRequestInFlight=false;}',
  '  }',
  '  void loadStandaloneSignals();',
  '  window.setInterval(loadStandaloneSignals,30000);',
  '}'
];
const newBlock=lines.join('\n');
export function patchJs(s){
 assert.equal(s.split(oldAnchor).length,2,'SIGNAL_JS_ANCHOR_DRIFT');
 assert(s.includes('function start()')&&s.includes('function consume(rows)')&&s.includes("window.addEventListener('ball46:signals-snapshot'"),'SIGNAL_JS_STRUCTURE_DRIFT');
 assert(!s.includes('BALL46_SIGNAL_STANDALONE_FETCH_20261023'),'ALREADY_PATCHED_JS');
 const next=s.replace(oldAnchor,newBlock+'\n'+oldAnchor);
 assert.equal(next.replace(newBlock+'\n',''),s,'UNEXPECTED_JS_CHANGE');
 return next;
}
export function patchHtml(s){
 const m=[...s.matchAll(/<script\s+src=["']signal-next\.js\?v=343-next-production-v1["']\s+defer\s*><\/script>/gi)];
 assert.equal(m.length,1,'SIGNAL_HTML_SCRIPT_TAG_DRIFT');
 const oldTag=m[0][0],newTag='<script src="signal-next.js?v=343-next-production-v1-'+VERSION_TAG+'" defer></script>';
 const next=s.replace(oldTag,newTag);
 assert.equal(next.replace(newTag,oldTag),s,'UNEXPECTED_HTML_CHANGE');
 return{html:next,oldTag,newTag};
}
export function patchWorker(s,expectedSha,oldTag,newTag){
 assert.equal(sha(Buffer.from(s)),expectedSha,'ACTIVE_WORKER_SHA_CHANGED');
 assert.equal(s.split('export default {').length,2,'WORKER_EXPORT_DRIFT');
 const body=[
  'const __b46SignalOldJsAnchor='+JSON.stringify(oldAnchor)+';',
  'const __b46SignalJsInjection='+JSON.stringify(newBlock)+';',
  'const __b46SignalOldHtmlTag='+JSON.stringify(oldTag)+';',
  'const __b46SignalNewHtmlTag='+JSON.stringify(newTag)+';',
  'export default {...__b46SignalRestoreOriginal20261023,async fetch(request,env,ctx){',
  '  const path=new URL(request.url).pathname;',
  "  const js=request.method==='GET'&&path==='/signal-next.js';",
  "  const html=request.method==='GET'&&path==='/signal.html';",
  '  const response=await __b46SignalRestoreOriginal20261023.fetch.call(__b46SignalRestoreOriginal20261023,request,env,ctx);',
  '  if((!js&&!html)||response.status!==200)return response;',
  "  const type=String(response.headers.get('content-type')||'').toLowerCase();",
  "  if(js&&!type.includes('javascript'))throw Error('SIGNAL_JS_MIME_CHANGED');",
  "  if(html&&!type.includes('html'))throw Error('SIGNAL_HTML_MIME_CHANGED');",
  '  const original=await response.text();',
  '  const old=js?__b46SignalOldJsAnchor:__b46SignalOldHtmlTag;',
  '  const changed=js?__b46SignalJsInjection+"\\n"+old:__b46SignalNewHtmlTag;',
  "  if(original.split(old).length!==2)throw Error('SIGNAL_SOURCE_DRIFT');",
  '  const out=original.replace(old,changed);',
  '  const headers=new Headers(response.headers);',
  "  headers.delete('content-length');headers.delete('etag');",
  "  headers.set('Cache-Control','no-store, must-revalidate');",
  "  headers.set('x-ball46-signal-repair','standalone-fetch-20261023');",
  '  return new Response(out,{status:response.status,statusText:response.statusText,headers});',
  '}};'
 ].join('\n');
 const next=s.replace('export default {','const __b46SignalRestoreOriginal20261023 = {')+'\n'+body;
 assert.equal(next.split('export default {').length,2,'OUTPUT_EXPORT_DRIFT');
 return next;
}
