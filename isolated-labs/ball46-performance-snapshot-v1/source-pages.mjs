/*
 * Read only: BALL46 Engine statistics from the public site's own API.
 * No calls to 5USD or any football data provider.
 * Paginated to avoid parsing a 39 MB full ledger in one Worker invocation.
 */
const FIXED_SOURCE='https://www.ball46.com/api/engine/statistics';
const MAX_PAGE_BYTES=8*1024*1024;
const FIELDS=['ledgerTotal','total','pending','unresolved','win','loss','push',
  'halfWin','halfLoss','ledgerUpdatedAt','settlementRevision'];
const signature=j=>JSON.stringify(FIELDS.map(k=>j?.[k]??null));

export function createPagedStatisticsSource(fetchFn=fetch,{url=FIXED_SOURCE,timeoutMs=25000}={}){
  if(url!==FIXED_SOURCE)throw Error('UNTRUSTED_STATS_SOURCE_URL');
  async function read(cursor=null){
    const target=new URL(url);
    target.searchParams.set('paged','1');
    if(cursor!==null)target.searchParams.set('cursor',cursor);
    const res=await fetchFn(target.toString(),{
      method:'GET',headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(timeoutMs),redirect:'manual',cache:'no-store'
    });
    if(res.status>=300&&res.status<400)throw Error('STATISTICS_REDIRECT_BLOCKED');
    if(!res.ok)throw Error('STATISTICS_HTTP_'+res.status);
    if(!String(res.headers.get('content-type')||'').includes('application/json'))
      throw Error('STATISTICS_CONTENT_TYPE_MISMATCH');
    const length=Number(res.headers.get('content-length'));
    if(Number.isFinite(length)&&length>MAX_PAGE_BYTES)throw Error('STATISTICS_PAGE_TOO_LARGE');
    // Guard against a misconfigured endpoint returning the full ledger.
    let size=0,chunks=[];
    if(res.body?.getReader){
      const reader=res.body.getReader();
      try{
        while(true){
          const {done,value}=await reader.read();if(done)break;
          size+=value.byteLength;if(size>MAX_PAGE_BYTES)throw Error('STATISTICS_PAGE_TOO_LARGE');
          chunks.push(value);
        }
      }finally{reader.releaseLock()}
      const bytes=new Uint8Array(size);let i=0;
      for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length}
      chunks=[];
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    const data=await res.arrayBuffer();
    if(data.byteLength>MAX_PAGE_BYTES)throw Error('STATISTICS_PAGE_TOO_LARGE');
    return JSON.parse(new TextDecoder().decode(data));
  }
  async function head(){
    const response=await read();
    if(response?.ok!==true||!Array.isArray(response.rows)||!Number.isSafeInteger(Number(response.ledgerTotal))
      ||!response.ledgerUpdatedAt)throw Error('STATISTICS_HEAD_BAD_SHAPE');
    return response;
  }
  async function* pages(first){
    if(first?.ok!==true||!Array.isArray(first.rows))throw Error('STATISTICS_FIRST_PAGE_REQUIRED');
    const initialSignature=signature(first);
    const seen=new Set();
    let current=first,iterations=0,rowCount=0;
    while(true){
      if(signature(current)!==initialSignature)throw Error('LEDGER_CHANGED_DURING_PAGING');
      if(!Array.isArray(current.rows)||current.ok!==true)throw Error('LEDGER_PAGE_INVALID');
      rowCount+=current.rows.length;
      yield current;
      iterations++;
      if(iterations>200)throw Error('LEDGER_TOO_MANY_PAGES');
      const cursor=current.nextCursor;
      if(!cursor){
        if(current.hasMore===true)throw Error('LEDGER_PAGE_CURSOR_MISSING');
        break;
      }
      if(typeof cursor!=='string'||cursor.length>4096||seen.has(cursor))
        throw Error('LEDGER_BAD_OR_REPEATED_CURSOR');
      seen.add(cursor);
      current=await read(cursor);
    }
    if(rowCount!==Number(first.ledgerTotal))throw Error('LEDGER_PAGE_COUNT_INCOMPLETE');
  }
  return {head,pages};
}
