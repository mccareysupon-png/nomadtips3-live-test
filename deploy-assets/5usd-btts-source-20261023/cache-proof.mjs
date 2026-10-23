import{mkdir,writeFile}from'node:fs/promises';
const boardURL='https://ball46.com/api/engine/board?bttsCacheRead='+Date.now();
const b=await fetch(boardURL,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),board=await b.json();
if(!b.ok||!board.ok)throw Error('ENGINE_BOARD_UNAVAILABLE');
const live=board.fixtures.filter(f=>f.boardState==='live'||f.status==='in_play'||f.status==='live');
const fixtureIds=live.map(f=>f.fixtureId).filter(Boolean).slice(0,100);
const destinations=[
'https://ball46.com/api/full-market/board-cache',
'https://nomadtips3-full-market-343-ball46.mccarey-supon.workers.dev/board-cache'
];
let checks=[];
for(const url of destinations){
 try{
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds}),signal:AbortSignal.timeout(40000)}),
  raw=await r.text();let data=null;try{data=JSON.parse(raw)}catch(e){}
  const result={route:url,status:r.status,bytes:raw.length,topKeys:Object.keys(data||{}),mode:data?.mode,requested:data?.fixtureCount,hits:data?.hits,staleHits:data?.staleHits,externalRequestsAdded:data?.externalRequestsAdded,examples:[],count:{withBtts:0,withLiveBtts:0,withBet365Btts:0,withBet365LiveBtts:0,withOpeningBtts:0,withClosingBtts:0,allBttsOffers:0,inplayYes:0,inplayNo:0},error:data?.error||null};
  const entries=data?.entries||{};
  for(const [id,entry]of Object.entries(entries)){
   const bs=entry?.fullOdds?.bookmakers||[];
   const norm=x=>String(x||'').toLowerCase().replace(/[\s_-]/g,'');
   let had=false,liveFound=false,bet365=false,bet365Live=false,opening=false,closing=false;
   for(const book of bs){
    const slug=norm(book.slug||book.name||book.bookmaker?.slug||book.bookmaker?.name),market=book.odds?.btts;
    if(!market)continue;had=true;result.count.allBttsOffers++;
    const stage=market.inplay??market.live??null;const valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>1;
    const yy=valid(stage?.yes),nn=valid(stage?.no);
    if(yy||nn)liveFound=true;if(yy)result.count.inplayYes++;if(nn)result.count.inplayNo++;
    if(market.opening?.yes||market.opening?.no)opening=true;
    if(market.closing?.yes||market.closing?.no)closing=true;
    if(slug.includes('bet365')){bet365=true;if(yy||nn)bet365Live=true;}
    if(result.examples.length<8)result.examples.push({fixture:id,bookmaker:slug,stale:entry.stale,ageMs:entry.ageMs,opening:market.opening??null,closing:market.closing??null,inplay:stage});
   }
   if(had)result.count.withBtts++;if(liveFound)result.count.withLiveBtts++;if(bet365)result.count.withBet365Btts++;if(bet365Live)result.count.withBet365LiveBtts++;
   if(opening)result.count.withOpeningBtts++;if(closing)result.count.withClosingBtts++;
  }
  checks.push(result);
 }catch(e){checks.push({route:url,error:String(e.message||e)})}
}
const out={at:new Date().toISOString(),fixtureIdsCount:fixtureIds.length,liveCount:live.length,checks};
await mkdir('audit',{recursive:true});await writeFile('audit/btts-live-cache-proof.json',JSON.stringify(out,null,2));
console.log('B46_BTTS_CACHE_PROOF='+JSON.stringify({at:out.at,fixtureIdsCount:out.fixtureIdsCount,liveCount:out.liveCount,checks:checks.map(x=>({...x,examples:x.examples?.slice(0,6)}))}).slice(0,22000));
