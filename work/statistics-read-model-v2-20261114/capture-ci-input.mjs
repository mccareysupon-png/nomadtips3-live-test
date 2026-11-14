// Read-only QA capture. Does not call providers, force refresh, sync, POST or deploy.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='https://ball46-production.mccarey-supon.workers.dev',dir=new URL('./qa/',import.meta.url);
const sha=s=>createHash('sha256').update(s).digest('hex');
await mkdir(new URL('live-base/',dir),{recursive:true});
async function get(path){const r=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'QA_GET_FAILED:'+path);return r.text()}
const html=await get('/');await writeFile(new URL('live-base/index.html',dir),html);
const refs=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
for(const [name,file,hash]of [['dashboard-v2-stage3-featured-facts-20261013a.js','scorebar.js','6d5f2fa340a3257687840d0ff29152ffd6f6cac26367cd900ae2a8989b47c973'],['singlepage-workspace-343.js','workspace.js','4957e9d547e5c468d45aa5ce7436fbe7510e740dcf20177ecf5cff4f51dcf8ed'],['longterm-performance-343.js','performance.js','822f3d9d271a948d6b862eb7732f8797dcedbcc743cd63f3094f217b537b22bf'],['market-registry-343.js','registry.js','cf07987a442c6d8bfc4a19cd6035afb4d43a06ca3a2bc60ed2cc801e4babf126']]){
 const ref=refs.find(p=>new URL(p,origin).pathname==='/'+name);assert(ref,'ACTIVE_ASSET_MISSING:'+name);
 const source=await get(new URL(ref,origin).pathname+new URL(ref,origin).search);assert.equal(sha(source),hash,'ACTIVE_SOURCE_DRIFT:'+name);await writeFile(new URL('live-base/'+file,dir),source);
}
for(const [path,file] of [['/api/hub/snapshot','hub.json'],['/api/engine/signals','signals.json']])await writeFile(new URL('live-base/'+file,dir),await get(path));
let captured;
for(let attempt=0;attempt<3;attempt++){
 const c={rows:[],started:new Date().toISOString(),first:null,last:null,pages:0};let cursor='stat:v2:row:\uffff';const cursors=new Set();
 while(cursor){assert(c.pages<250,'PAGE_BUDGET');assert(!cursors.has(cursor),'CURSOR_LOOP');cursors.add(cursor);
  const page=JSON.parse(await get('/api/engine/statistics?paged=1&limit=500&cursor='+encodeURIComponent(cursor)));assert(page.ok&&Array.isArray(page.rows),'INVALID_PAGE');const m={...page};delete m.rows;c.first??=m;c.last=m;c.rows.push(...page.rows);c.pages++;cursor=page.nextCursor;
 }
 c.ended=new Date().toISOString();c.metadataStable=['ledgerTotal','total','pending','unresolved','win','loss','push','halfWin','halfLoss'].every(k=>c.first[k]===c.last[k]);c.sourceSnapshotPinned=false;
 if(c.metadataStable&&c.rows.length===c.first.ledgerTotal){captured=c;break}
 console.log('CAPTURE_SOURCE_CHANGED_RETRY',attempt+1);
}
assert(captured,'NO_COMPLETE_STABLE_CAPTURE');await writeFile(new URL('live-ledger.json',dir),JSON.stringify(captured));console.log('FRESH_READ_ONLY_CAPTURE',JSON.stringify({rows:captured.rows.length,started:captured.started,ended:captured.ended,sourceSnapshotPinned:false}));
