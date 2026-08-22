const BASE='https://www.nowgoal.net';
const headers={
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept':'*/*','accept-language':'en-US,en;q=0.9','cache-control':'no-cache','pragma':'no-cache',
  'referer':`${BASE}/`,
};
async function get(urlOrPath){
  const url=new URL(urlOrPath,BASE);url.searchParams.set('_nomad_schema',String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(url,{headers,redirect:'follow',signal:controller.signal});return {status:r.status,url:r.url,type:r.headers.get('content-type')||'',text:await r.text()};}
  finally{clearTimeout(timer);}
}
function around(text,needle,radius=1800){const p=text.indexOf(needle);return p<0?'NOT_FOUND':text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)).replace(/\s+/g,' ');}
function scriptSrc(html,part){for(const m of html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)){if(m[1].includes(part))return new URL(m[1],BASE).href;}return null;}

const home=await get('/');
const liveScoreUrl=scriptSrc(home.text,'liveScore');
console.log(`LIVESCORE_URL ${liveScoreUrl}`);
if(liveScoreUrl){
  const js=await get(liveScoreUrl);
  console.log(`LIVESCORE status=${js.status} bytes=${js.text.length}`);
  for(const term of ['function LoadLiveFile','LoadLiveFile=function','function getoddsxml','function LoadOddsDetailChange','runOddsData_','ch_runOddsData_','goal"+companyID','function refresh(','function oddsRefresh','function getxml']){
    console.log(`SNIP ${term} :: ${around(js.text,term)}`);
  }
}

// Probe likely polling files exactly as referenced by the current live-score script.
for(const path of [
  '/gf/data/odds/en/runOddsData_50.xml',
  '/gf/data/odds/en/ch_runOddsData_50.xml',
  '/gf/data/odds/en/ch_goal50.xml',
]){
  try{const r=await get(path);console.log(`FILE ${path} status=${r.status} type=${r.type} bytes=${r.text.length} sample=${r.text.replace(/\s+/g,' ').slice(0,12000)}`);}
  catch(e){console.log(`FILE_ERROR ${path} ${e?.message||e}`);}
}

// Inspect current pages for a few schedule ids that definitely exist in goal50.
const goal=await get('/gf/data/odds/en/goal50.xml');
const ids=[...goal.text.matchAll(/<m>(\d+),/g)].slice(0,8).map(m=>m[1]);
for(const id of ids){
  const page=await get(`/asian-handicap-odds/${id}`);
  const oneX=page.text.match(/<tr[^>]*cid=["']50["'][^>]*>[\s\S]*?<\/tr>/i)?.[0]||'';
  console.log(`PAGE_1XBET id=${id} status=${page.status} row=${oneX.replace(/<[^>]+>/g,'|').replace(/\s+/g,' ').slice(0,2500)}`);
}
