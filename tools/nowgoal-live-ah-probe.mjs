const BASE='https://www.nowgoal.net';
const headers={
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept':'*/*',
  'accept-language':'en-US,en;q=0.9',
  'cache-control':'no-cache',
  'pragma':'no-cache',
  'referer':`${BASE}/`,
  'x-requested-with':'XMLHttpRequest',
};
const get=async path=>{
  const url=new URL(path,BASE);url.searchParams.set('_nomad_probe',String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{headers,redirect:'follow',signal:controller.signal});
    return {url:response.url,status:response.status,type:response.headers.get('content-type')||'',text:await response.text()};
  }finally{clearTimeout(timer);}
};
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const sample=(s,n=10000)=>compact(s).slice(0,n);
const uniq=a=>[...new Set(a)];

console.log('=== NOWGOAL 1XBET LIVE AH PAYLOAD PROBE ===');
const goal=await get('/gf/data/odds/en/goal50.xml');
console.log(`GOAL50 status=${goal.status} type=${goal.type} bytes=${goal.text.length}`);
console.log(`GOAL50_SAMPLE ${sample(goal.text,14000)}`);

// Schedule ids on Nowgoal are currently numeric. Extract plausible ids from the public 1xBet feed,
// then validate them through the company-specific live endpoint instead of assuming field positions.
const numeric=uniq([...goal.text.matchAll(/\b(\d{6,9})\b/g)].map(m=>m[1]));
console.log(`GOAL50_NUMERIC_CANDIDATES ${numeric.slice(0,80).join(',')}`);

const tested=[];
for(const id of numeric.slice(0,30)){
  try{
    const live=await get(`/ajax/soccerajax?type=14&t=10&id=${encodeURIComponent(id)}&cid=50`);
    const body=compact(live.text);
    const meaningful=live.status===200&&body.length>10&&!/^(?:null|undefined|\{\}|\[\]|-)$/.test(body);
    tested.push({id,status:live.status,bytes:live.text.length,meaningful,body:sample(live.text,3500)});
    if(meaningful) console.log(`T10_LIVE id=${id} status=${live.status} bytes=${live.text.length} body=${sample(live.text,7000)}`);
  }catch(error){console.log(`T10_ERROR id=${id} ${error?.message||error}`);}
  if(tested.filter(x=>x.meaningful).length>=6) break;
}
console.log(`T10_TESTED ${JSON.stringify(tested.map(({id,status,bytes,meaningful})=>({id,status,bytes,meaningful})))}`);

// Also sample the AH comparison endpoint for ids proven by the company-specific endpoint.
for(const item of tested.filter(x=>x.meaningful).slice(0,6)){
  for(const state of [1,3,0]){
    try{
      const ah=await get(`/ajax/soccerajax?type=14&t=2&id=${encodeURIComponent(item.id)}&h=0&s=${state}`);
      const body=compact(ah.text);
      console.log(`T2_AH id=${item.id} state=${state} status=${ah.status} bytes=${ah.text.length} body=${sample(ah.text,7000)}`);
      if(body.length>20) break;
    }catch(error){console.log(`T2_ERROR id=${item.id} state=${state} ${error?.message||error}`);}
  }
}
