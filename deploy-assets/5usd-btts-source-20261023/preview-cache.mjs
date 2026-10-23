import{mkdir,writeFile}from'node:fs/promises';
const board=await fetch('https://ball46.com/api/engine/board?bttsCachedAt='+Date.now(),{signal:AbortSignal.timeout(50000)}).then(r=>r.json());
if(board.ok!==true)throw Error('ENGINE_BOARD_UNAVAILABLE');
const fixtureIds=board.fixtures.filter(x=>x.boardState==='live'||x.status==='in_play'||x.status==='live').map(x=>x.fixtureId).filter(Boolean);
const v='3a53ee1a-467c-4a20-9f50-ba749e8adab4';
const previews=['https://3a53ee1a-nomadtips3-full-market-343-ball46.mccarey-supon.workers.dev','https://nomadtips3-full-market-343-ball46.mccarey-supon.workers.dev'];
const report={at:new Date().toISOString(),onlyCacheRead:true,externalRequestsAllowed:false,requested:fixtureIds.length,checks:[]};
const valid=x=>x!=null&&x!==''&&Number.isFinite(Number(x))&&Number(x)>1;
for(const host of previews){
 const url=host+'/board-cache';
 try{
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds}),signal:AbortSignal.timeout(30000)});
  const txt=await res.text();let payload;try{payload=JSON.parse(txt)}catch(e){}
  const o={host,status:res.status,bytes:txt.length,contentType:res.headers.get('content-type'),keys:Object.keys(payload||{}),mode:payload?.mode,externalRequestsAdded:payload?.externalRequestsAdded,hits:payload?.hits,staleHits:payload?.staleHits};
  if(payload?.ok&&payload?.mode==='CENTRAL_CACHE_READ_ONLY'&&payload?.externalRequestsAdded===0){
   const entries=payload.entries||{};const groups={total:0,bet365:0,nonBet365:0,opening:0,closing:0,inplayYes:0,inplayNo:0,validInplayMatches:0};
   const samples=[];
   for(const [fid,entry]of Object.entries(entries)){
    groups.total++;const bks=entry?.fullOdds?.bookmakers||[];let validThis=false;
    for(const b of bks){const slug=String(b.slug??b.bookmaker?.slug??b.name??'').toLowerCase().replace(/[\s_-]/g,'');const btts=b.odds?.btts;
     if(!btts)continue;if(slug==='bet365')groups.bet365++;else groups.nonBet365++;
     if(valid(btts.opening?.yes)||valid(btts.opening?.no))groups.opening++;
     if(valid(btts.closing?.yes)||valid(btts.closing?.no))groups.closing++;
     if(valid(btts.inplay?.yes)){groups.inplayYes++;validThis=true;}
     if(valid(btts.inplay?.no)){groups.inplayNo++;validThis=true;}
     if(samples.length<10)samples.push({fixtureId:fid,book:slug,stale:entry.stale,ageMs:entry.ageMs,opening:btts.opening||null,closing:btts.closing||null,inplay:btts.inplay||null});
    }if(validThis)groups.validInplayMatches++;
   }
   o.groups=groups;o.samples=samples;
  }else{o.error=payload?.error??null;}
  report.checks.push(o);
 }catch(e){report.checks.push({host,error:String(e.message||e)})}
}
await mkdir('audit',{recursive:true});await writeFile('audit/fm-preview-cache-read.json',JSON.stringify(report,null,2));
console.log('BTTS_FM_PREVIEW_CACHE='+JSON.stringify(report).slice(0,20000));
