// Read-only Ledger transport. Adaptive page size retains the same cursor and
// content-generation fence; it never changes upstream polling or Ledger data.
export async function readEngine(owner,path){
 const u=new URL(path,'https://engine.internal');if(u.pathname!=='/ledger-health'&&(u.pathname!=='/statistics'||u.searchParams.get('paged')!=='1'||!u.searchParams.get('cursor')?.startsWith('stat:v2:row:')))throw Error('READ_PATH_DENIED');
 if(u.pathname==='/statistics'&&owner.sourcePageLimit===500)u.searchParams.set('limit','500');
 const r=await owner.env.ENGINE.fetch(new Request(u,{signal:AbortSignal.timeout(15000)}));
 if(r.status===409)throw Error('SOURCE_CHANGED');
 if(!r.ok){if(u.pathname==='/statistics'&&u.searchParams.get('limit')!=='500'&&[500,502,503,504,599].includes(r.status)){await r.body?.cancel();owner.sourcePageLimit=500;return readEngine(owner,u.pathname+u.search)}throw Error('ENGINE_HTTP_'+r.status)}
 if(Number(r.headers.get('content-length'))>12*1024*1024)throw Error('PAGE_SIZE_LIMIT');const body=await r.text();if(body.length>12*1024*1024)throw Error('PAGE_SIZE_LIMIT');const data=JSON.parse(body);if(data.ok!==true)throw Error('ENGINE_NOT_OK');return data;
}
