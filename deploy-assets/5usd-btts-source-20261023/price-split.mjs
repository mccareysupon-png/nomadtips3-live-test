import {mkdir,writeFile} from'node:fs/promises';
const u='https://ball46.com/api/engine/board?traceBttsFields='+Date.now();
const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)}),j=await r.json();
if(!r.ok||!j.ok)throw Error('ENGINE_BOARD_UNAVAILABLE');
const live=j.fixtures.filter(x=>x.boardState==='live'||x.status==='in_play'||x.status==='live');
const stat={at:new Date().toISOString(),fixtureCount:live.length,fullOddsSources:{},fullOddsShapes:{},marketBlocks:{},hasDirectBtts:0,withFullBooks:0,withProviderBooks:0,stage:{fullDirect:{yes:0,no:0,opening:0,closing:0},fullBooks:{yes:0,no:0,opening:0,closing:0},providerBooks:{yes:0,no:0,opening:0,closing:0}},fixturesWith:{fullDirect:0,fullBooks:0,providerBooks:0,liveFullDirect:0,liveFullBooks:0,liveProviderBooks:0},samples:[]};
const valid=n=>n!=null&&n!==''&&Number.isFinite(Number(n))&&Number(n)>1;
const read=(stage,found)=>{const o=stage||{};if(valid(o.inplay?.yes))stat.stage[found].yes++;if(valid(o.inplay?.no))stat.stage[found].no++;if(valid(o.opening?.yes)||valid(o.opening?.no))stat.stage[found].opening++;if(valid(o.closing?.yes)||valid(o.closing?.no))stat.stage[found].closing++;return valid(o.inplay?.yes)||valid(o.inplay?.no)};
for(const f of live){
 const source=f.fullOddsSource??'unknown';stat.fullOddsSources[source]=(stat.fullOddsSources[source]||0)+1;
 const full=f.fullOdds??{},provider=f.providerOdds??{};
 const shape=Object.keys(full).join(',');stat.fullOddsShapes[shape]=(stat.fullOddsShapes[shape]||0)+1;
 const dir=full.btts??full.bet365?.odds?.btts??null;
 const fb=full.bookmakers??[],pb=provider.bookmakers??[];
 let yes=[],no=[],stageBook=[],hasBD=Boolean(dir),lBD=false,hasFB=false,lFB=false,hasPB=false,lPB=false;
 if(dir){stat.hasDirectBtts++;stat.fixturesWith.fullDirect++;lBD=read(dir,'fullDirect');if(lBD)stat.fixturesWith.liveFullDirect++;}
 for(const b of fb){const ob=b.odds?.btts??b.markets?.btts;if(!ob)continue;hasFB=true;if(read(ob,'fullBooks'))lFB=true; if(stageBook.length<6)stageBook.push({at:'full',book:b.slug??b.name,inplay:ob.inplay??null,opening:ob.opening??null,closing:ob.closing??null});}
 for(const b of pb){const ob=b.odds?.btts??b.markets?.btts;if(!ob)continue;hasPB=true;if(read(ob,'providerBooks'))lPB=true; if(stageBook.length<6)stageBook.push({at:'provider',book:b.slug??b.name,inplay:ob.inplay??null,opening:ob.opening??null,closing:ob.closing??null});}
 if(fb.length)stat.withFullBooks++;if(pb.length)stat.withProviderBooks++;
 if(hasFB)stat.fixturesWith.fullBooks++;if(hasPB)stat.fixturesWith.providerBooks++;
 if(lFB)stat.fixturesWith.liveFullBooks++;if(lPB)stat.fixturesWith.liveProviderBooks++;
 if(stat.samples.length<14&&(hasBD||hasFB||hasPB)){
  stat.samples.push({fixtureId:f.fixtureId,minute:f.minute,goals:f.goals,source,fullAgeMs:f.fullOddsFetchedAt?Date.now()-f.fullOddsFetchedAt:null,fullFetchedAt:f.fullOddsFetchedAt,
    dir:dir?{opening:dir.opening??null,closing:dir.closing??null,inplay:dir.inplay??null}:null,books:stageBook,
    firstFullBookKeys:fb[0]?Object.keys(fb[0]).slice(0,12):null,analysis:{yes:f.analysis?.ft_btts_yes?.state,no:f.analysis?.ft_btts_no?.state}});
 }
}
await mkdir('audit',{recursive:true});await writeFile('audit/btts-engine-price-split.json',JSON.stringify(stat,null,2));
console.log('B46_ENGINE_BTTS_SPLIT='+JSON.stringify(stat).slice(0,27500));
