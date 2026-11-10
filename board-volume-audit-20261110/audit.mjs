import assert from 'node:assert/strict';
const urls=[
  'https://ball46.com/api/engine/board',
  'https://ball46.com/api/engine/signals',
  'https://ball46.com/'
];
for(const url of urls){
  const r=await fetch(url,{headers:{'cache-control':'no-cache','user-agent':'BALL46-readonly-volume-audit/1.0'},signal:AbortSignal.timeout(45000)});
  const type=r.headers.get('content-type')||'';
  console.log('URL='+url+' STATUS='+r.status+' TYPE='+type);
  if(type.includes('application/json')){
    const j=await r.json();
    if(url.endsWith('/board')){
      const rows=Array.isArray(j?.fixtures)?j.fixtures:Array.isArray(j?.rows)?j.rows:Array.isArray(j)?j:[];
      const bucket={live:0,scheduled:0,finished:0,unknown:0,other:0};
      const raw=[];
      for(const f of rows){
        const s=String(f?.status||f?.statusCode||f?.statusReason||'').toLowerCase();
        const b=String(f?.boardState||'').toLowerCase();
        let k='other';
        if(/live|playing|inplay|1h|2h|ht|half/.test(s)||b==='live')k='live';
        else if(/finish|ended|ft/.test(s)||b==='finished')k='finished';
        else if(/sched|not started|ns|upcoming/.test(s)||b==='scheduled')k='scheduled';
        else if(/unknown|postpon|cancel|abandon|suspend|delay/.test(s)||b==='unknown')k='unknown';
        bucket[k]++;
        raw.push({id:String(f?.fixtureId??''),status:s,board:b,home:f?.home?.name||'',away:f?.away?.name||'',kickoff:f?.kickoffAt??f?.kickoffUtc??null,providerOddsKeys:f?.providerOdds&&typeof f.providerOdds==='object'?Object.keys(f.providerOdds).length:0});
      }
      console.log('BOARD_TOTAL='+rows.length);
      console.log('BOARD_BUCKETS='+JSON.stringify(bucket));
      console.log('BOARD_SAMPLE='+JSON.stringify(raw.slice(0,20)));
    }else{
      const rows=Array.isArray(j?.signals)?j.signals:Array.isArray(j?.rows)?j.rows:Array.isArray(j)?j:[];
      console.log('SIGNALS_TOTAL='+rows.length);
    }
  }else{
    const t=await r.text();
    console.log('HTML_LEN='+t.length);
    for(const key of ['const COLLAPSED_LIMIT=','function visibleRows()','function renderBoard()','stableBoardStructureKey','syncStableMatchRow','replaceChildren','innerHTML','setInterval','POLL_MS','scheduleRichRender']){
      const i=t.indexOf(key);
      if(i>=0)console.log('KEY='+key+' CTX='+t.slice(Math.max(0,i-1200),Math.min(t.length,i+5000)).replace(/\n/g,'\\n'));
    }
  }
}
