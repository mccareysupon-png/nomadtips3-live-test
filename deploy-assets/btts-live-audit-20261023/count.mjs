import{mkdir,writeFile}from'node:fs/promises';
const u='https://ball46.com/api/engine/board?bttsPriceCount='+Date.now();const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP_'+r.status);const board=await r.json();
const live=board.fixtures.filter(f=>f.boardState==='live'||f.status==='in_play'||f.status==='live');
const nums={at:new Date().toISOString(),liveFixtures:live.length,withBttsBlock:0,withBookmakerBtts:0,withValidBttsLivePrice:0,yesPriceFixtures:0,noPriceFixtures:0,bookmakerOffers:0,yesOffers:0,noOffers:0,openingOffers:0,closingOffers:0,missingInplayOffers:0,states:{yes:{},no:{}},examples:[]};
const valid=x=>Number.isFinite(Number(x))&&x!==null&&x!==''&&Number(x)>1;
for(const f of live){
 for(const k of ['yes','no']){const s=f.analysis?.['ft_btts_'+k]?.state||'MISSING';nums.states[k][s]=(nums.states[k][s]||0)+1;}
 const books=f.providerOdds?.bookmakers||[];let found=false,y=false,n=false;
 for(const book of books){const btts=book.odds?.btts||book.markets?.btts;if(!btts)continue;
  nums.bookmakerOffers++;found=true;
  for(const key of ['opening','closing'])if((btts[key]?.yes!=null)||(btts[key]?.no!=null))nums[key+'Offers']++;
  const stage=btts.inplay??btts.live??null;if(!stage){nums.missingInplayOffers++;continue;}
  const yy=stage.yes??stage.YES,nn=stage.no??stage.NO;
  if(valid(yy)){y=true;nums.yesOffers++;}if(valid(nn)){n=true;nums.noOffers++;}
  if((valid(yy)||valid(nn))&&nums.examples.length<8)nums.examples.push({fixtureId:f.fixtureId,minute:f.minute,score:f.goals,bookmaker:book.slug||book.name,yes:yy??null,no:nn??null,yesState:f.analysis?.ft_btts_yes?.state,noState:f.analysis?.ft_btts_no?.state});
 }
 if(found)nums.withBookmakerBtts++;
 if(y||n)nums.withValidBttsLivePrice++;if(y)nums.yesPriceFixtures++;if(n)nums.noPriceFixtures++;
}
await mkdir('audit',{recursive:true});await writeFile('audit/btts-price-count.json',JSON.stringify(nums,null,2));
console.log('B46_BTTS_PRICE_COUNT='+JSON.stringify(nums));
